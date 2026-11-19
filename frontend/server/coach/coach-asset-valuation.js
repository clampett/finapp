const { model: defaultModel, origin: defaultOrigin } = require('./coach-prompts');

function heuristicAssetValuation(text) {
  const clean = (text || '').trim();
  const lower = clean.toLowerCase();

  // Try extracting an explicit dollar amount if provided by the user (e.g., "$15k", "$15,000", "25000 dollars", etc.)
  let explicitAmount = null;
  const kMatch = lower.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:k\b|thousand)/i);
  if (kMatch) {
    explicitAmount = parseFloat(kMatch[1]) * 1000;
  } else {
    const dollarMatch = lower.match(
      /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/,
    );
    if (dollarMatch) {
      explicitAmount = parseFloat(dollarMatch[1].replace(/,/g, ''));
    }
  }

  // Vehicles
  const vehicleRegex =
    /\b(car|truck|suv|sedan|coupe|motorcycle|honda|toyota|ford|chevrolet|chevy|tesla|bmw|mercedes|audi|nissan|subaru|hyundai|kia|camry|civic|corolla|accord|rav4|f-150|mustang|model 3|model y)\b/i;
  // Real Estate
  const realEstateRegex =
    /\b(house|home|condo|apartment|townhouse|property|land|acre|acres|duplex|real estate)\b/i;
  // Electronics
  const electronicsRegex =
    /\b(laptop|macbook|computer|pc|desktop|phone|iphone|samsung galaxy|ipad|tablet|camera|tv|television|gpu|playstation|xbox)\b/i;
  // Valuables / Jewelry / Luxury
  const valuablesRegex =
    /\b(watch|rolex|omega|jewelry|diamond|gold|silver|necklace|ring|guitar|gibson|fender|piano)\b/i;
  // Collectibles
  const collectiblesRegex =
    /\b(pokemon|card|charizard|coin|stamp|comic|collectible|vintage|antique|art|painting)\b/i;

  let categoryName = 'Assets';
  let estimatedAmount = explicitAmount ?? 1000;
  let assetName = clean.length > 60 ? clean.slice(0, 57) + '...' : clean;
  let notes = 'Heuristic asset estimate based on description.';

  if (vehicleRegex.test(lower)) {
    categoryName = 'Vehicles';
    if (!explicitAmount) {
      const yearMatch = lower.match(/\b(19\d\d|20\d\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : 2018;
      const currentYear = new Date().getFullYear();
      const age = Math.max(0, currentYear - year);
      estimatedAmount = Math.max(3500, Math.round((32000 * Math.pow(0.88, age)) / 100) * 100);
      const milesMatch = lower.match(/([0-9]+(?:,[0-9]{3})?|\d+k?)\s*(?:miles|mi\b)/i);
      if (milesMatch) {
        let miles = milesMatch[1].toLowerCase().endsWith('k')
          ? parseFloat(milesMatch[1]) * 1000
          : parseFloat(milesMatch[1].replace(/,/g, ''));
        if (miles > 100000)
          estimatedAmount = Math.max(3000, Math.round((estimatedAmount * 0.8) / 100) * 100);
      }
    }
    notes =
      'Estimated vehicle fair market value based on year/model and standard market depreciation.';
  } else if (realEstateRegex.test(lower)) {
    categoryName = 'Real Estate';
    if (!explicitAmount) {
      estimatedAmount = 375000;
    }
    notes =
      'Estimated residential property fair market value based on regional median comparables.';
  } else if (electronicsRegex.test(lower)) {
    categoryName = 'Electronics';
    if (!explicitAmount) {
      if (/\b(macbook|laptop|pc|desktop)\b/i.test(lower)) estimatedAmount = 1200;
      else if (/\b(phone|iphone)\b/i.test(lower)) estimatedAmount = 750;
      else if (/\b(ipad|tablet)\b/i.test(lower)) estimatedAmount = 500;
      else estimatedAmount = 400;
    }
    notes = 'Estimated consumer electronics resale value based on secondary market pricing.';
  } else if (valuablesRegex.test(lower)) {
    categoryName = 'Valuables';
    if (!explicitAmount) {
      if (/\brolex\b/i.test(lower)) estimatedAmount = 8500;
      else if (/\bwatch\b/i.test(lower)) estimatedAmount = 1500;
      else if (/\bgold\b/i.test(lower)) estimatedAmount = 2000;
      else if (/\bguitar|gibson|fender\b/i.test(lower)) estimatedAmount = 1800;
      else estimatedAmount = 1200;
    }
    notes = 'Estimated fair market valuation based on luxury and valuable goods benchmarks.';
  } else if (collectiblesRegex.test(lower)) {
    categoryName = 'Collectibles';
    if (!explicitAmount) {
      estimatedAmount = 750;
    }
    notes = 'Estimated secondary market collector valuation.';
  }

  if (assetName === lower && assetName.length > 0) {
    assetName = assetName.charAt(0).toUpperCase() + assetName.slice(1);
  }

  return {
    description: assetName,
    amount: Math.round(Number(estimatedAmount) * 100) / 100,
    categoryName,
    kind: 'income',
    notes,
    source: 'heuristic',
  };
}

function createAssetValuationService({
  request = fetch,
  model = defaultModel,
  origin = defaultOrigin,
} = {}) {
  async function checkOllamaReady() {
    try {
      const response = await request(`${origin}/api/tags`, {
        signal: AbortSignal.timeout(1500),
        redirect: 'error',
      });
      if (response.ok) {
        const body = await response.json();
        return body.models?.some((item) => item.name === model) ?? false;
      }
    } catch {
      // Loopback runtime offline
    }
    return false;
  }

  async function valueAsset(description) {
    if (typeof description !== 'string' || !description.trim() || description.length > 500) {
      return null;
    }

    const cleanDescription = description.trim();

    let ollamaReady = false;
    try {
      ollamaReady = await checkOllamaReady();
    } catch {
      ollamaReady = false;
    }

    if (ollamaReady) {
      try {
        const schema = {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Clean concise asset name' },
            amount: { type: 'number', description: 'Estimated dollar value (> 0)' },
            categoryName: { type: 'string', description: 'Asset category name' },
            kind: { type: 'string', enum: ['income', 'expense'], description: 'Transaction kind' },
            notes: { type: 'string', description: 'Brief explanation of estimate' },
          },
          required: ['description', 'amount', 'categoryName', 'kind', 'notes'],
        };

        const response = await request(`${origin}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
          body: JSON.stringify({
            model,
            stream: false,
            format: schema,
            messages: [
              {
                role: 'system',
                content:
                  'You are FinApp Asset Valuation AI. Given an asset description, estimate its current fair market value in US dollars. Suggest a clean title/description, an estimated dollar amount (number > 0), a category (e.g. Vehicles, Real Estate, Valuables, Electronics, Collectibles, Investments, Other), kind ("income"), and brief notes explaining the estimate. Return only JSON matching the schema.',
              },
              {
                role: 'user',
                content: `Asset description: ${cleanDescription}`,
              },
            ],
            options: {
              num_ctx: 2048,
              num_predict: 200,
              temperature: 0.2,
            },
          }),
        });

        if (response.ok) {
          const body = await response.json();
          const raw = body.message?.content?.trim();
          if (raw) {
            const parsed = JSON.parse(raw);
            if (
              parsed &&
              typeof parsed.amount === 'number' &&
              parsed.amount > 0 &&
              typeof parsed.description === 'string'
            ) {
              return {
                description: parsed.description.trim() || cleanDescription,
                amount: Math.round(parsed.amount * 100) / 100,
                categoryName: parsed.categoryName || 'Assets',
                kind: parsed.kind || 'income',
                notes: parsed.notes || `AI estimated based on: ${cleanDescription}`,
                source: 'local_ai',
              };
            }
          }
        }
      } catch {
        // Fall through to heuristic if Ollama call fails or times out
      }
    }

    return heuristicAssetValuation(cleanDescription);
  }

  return { valueAsset, checkOllamaReady };
}

module.exports = {
  createAssetValuationService,
  heuristicAssetValuation,
};
