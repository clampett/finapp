const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAssetValuationService,
  heuristicAssetValuation,
} = require('../../server/coach/coach-asset-valuation');

const ready = () => Response.json({ models: [{ name: 'qwen2.5:1.5b' }] });

test('valueAsset queries Ollama with JSON schema when local AI is ready', async () => {
  let chatPayload = null;
  const service = createAssetValuationService({
    request: async (url, options) => {
      if (url.endsWith('/api/tags')) return ready();
      if (url.endsWith('/api/chat')) {
        chatPayload = JSON.parse(options.body);
        return Response.json({
          done: true,
          done_reason: 'stop',
          message: {
            content: JSON.stringify({
              description: '2020 Honda Civic EX',
              amount: 19500,
              categoryName: 'Vehicles',
              kind: 'income',
              notes: 'Estimated fair market value for a 2020 Civic in good condition.',
            }),
          },
        });
      }
      return Response.json({});
    },
  });

  const result = await service.valueAsset('2020 Honda Civic with 30k miles');
  assert.ok(result);
  assert.equal(result.description, '2020 Honda Civic EX');
  assert.equal(result.amount, 19500);
  assert.equal(result.categoryName, 'Vehicles');
  assert.equal(result.kind, 'income');
  assert.equal(result.source, 'local_ai');
  assert.ok(chatPayload);
  assert.equal(chatPayload.model, 'qwen2.5:1.5b');
  assert.ok(chatPayload.format);
  assert.equal(chatPayload.format.type, 'object');
});

test('valueAsset falls back to heuristic estimator when Ollama is offline', async () => {
  const service = createAssetValuationService({
    request: async () => {
      throw new Error('ECONNREFUSED');
    },
  });

  const carResult = await service.valueAsset('2019 Toyota RAV4 with 45,000 miles');
  assert.ok(carResult);
  assert.equal(carResult.categoryName, 'Vehicles');
  assert.ok(carResult.amount > 3000);
  assert.equal(carResult.kind, 'income');
  assert.equal(carResult.source, 'heuristic');

  const houseResult = await service.valueAsset('3 bedroom house in Austin for $450k');
  assert.ok(houseResult);
  assert.equal(houseResult.categoryName, 'Real Estate');
  assert.equal(houseResult.amount, 450000);
  assert.equal(houseResult.source, 'heuristic');
});

test('valueAsset validates input and rejects empty or oversized descriptions', async () => {
  const service = createAssetValuationService();
  assert.equal(await service.valueAsset(''), null);
  assert.equal(await service.valueAsset('   '), null);
  assert.equal(await service.valueAsset(null), null);
  assert.equal(await service.valueAsset(123), null);
  assert.equal(await service.valueAsset('a'.repeat(501)), null);
});

test('heuristicAssetValuation handles various categories and price patterns', () => {
  const laptop = heuristicAssetValuation('Apple MacBook Pro 16 inch M2');
  assert.equal(laptop.categoryName, 'Electronics');
  assert.ok(laptop.amount >= 1000);

  const watch = heuristicAssetValuation('Vintage Rolex Submariner');
  assert.equal(watch.categoryName, 'Valuables');
  assert.ok(watch.amount >= 5000);

  const card = heuristicAssetValuation('1st Edition Charizard Pokemon card');
  assert.equal(card.categoryName, 'Collectibles');
  assert.ok(card.amount > 0);

  const customPrice = heuristicAssetValuation('Antique desk worth $1,500');
  assert.equal(customPrice.amount, 1500);
});
