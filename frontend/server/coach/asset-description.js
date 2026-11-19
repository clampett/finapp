const categories = [
  [
    'Vehicles',
    /\b(car|truck|suv|sedan|motorcycle|toyota|honda|ford|tesla|bmw|civic|rav4|camry)\b/i,
  ],
  ['Real Estate', /\b(house|home|condo|apartment|property|land|acre|duplex)\b/i],
  [
    'Electronics',
    /\b(laptop|macbook|computer|phone|iphone|ipad|tablet|camera|television|gpu|playstation|xbox)\b/i,
  ],
  ['Valuables', /\b(watch|rolex|omega|jewelry|diamond|gold|silver|necklace|ring|guitar|piano)\b/i],
  ['Collectibles', /\b(pokemon|card|coin|stamp|comic|collectible|vintage|antique|art|painting)\b/i],
];
const categoryNames = [...categories.map(([name]) => name), 'Other'];
const MAX_AMOUNT = 1000000000;
function cleanText(value, limit) {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit)
    : '';
}
function heuristicAssetValuation(description) {
  const name = cleanText(description, 100);
  const categoryName =
    categories.find(([, pattern]) => pattern.test(String(description)))?.[0] ?? 'Other';
  // Required explicit USD currency markers so model years, mileage, and weights were never prices.
  const number = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
  const marker = new RegExp(
    `(?:\\$\\s*|\\bUSD\\s*)(${number})\\s*(k\\b|thousand\\b|million\\b)?(?![\\d,]|\\.\\d|[A-Za-z])|(${number})\\s*(k\\b|thousand\\b|million\\b)?\\s*(?:USD|dollars)\\b`,
    'gi',
  );
  const matches = [...String(description).matchAll(marker)];
  let amount = null;
  if (matches.length === 1) {
    const match = matches[0],
      magnitude = (match[2] ?? match[4] ?? '').toLowerCase();
    const value =
      Number((match[1] ?? match[3]).replace(/,/g, '')) *
      (magnitude === 'million'
        ? 1000000
        : magnitude === 'k' || magnitude === 'thousand'
          ? 1000
          : 1);
    if (Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT)
      amount = Math.round(value * 100) / 100;
  }
  // Returned a user-supplied reference or no value instead of fabricating offline market comparables.
  return {
    description: name,
    categoryName,
    amount,
    source: amount === null ? 'unavailable' : 'provided',
    notes:
      amount === null
        ? 'No supported estimate is available. Add the exact model, age, condition, and a reference price, or enter your own value.'
        : 'This is an amount from your description, not an independently verified current resale value.',
    verified: false,
    currency: 'USD',
  };
}
module.exports = { heuristicAssetValuation, categoryNames, MAX_AMOUNT, cleanText };
