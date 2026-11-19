export interface AssetEstimate {
  description: string;
  amount: number | null;
  categoryName: string;
  source: 'local_ai' | 'provided' | 'unavailable';
  notes: string;
  verified: false;
  currency: 'USD';
}
// Validated model-backed responses before rendering or exporting a planning estimate.
export function isAssetEstimate(value: unknown): value is AssetEstimate {
  if (!value || typeof value !== 'object') return false;
  const item = value as AssetEstimate;
  return (
    typeof item.description === 'string' &&
    item.description.length > 0 &&
    item.description.length <= 100 &&
    (item.amount === null ||
      (Number.isFinite(item.amount) && item.amount > 0 && item.amount <= 1e9)) &&
    ['Vehicles', 'Real Estate', 'Electronics', 'Valuables', 'Collectibles', 'Other'].includes(
      item.categoryName,
    ) &&
    ['local_ai', 'provided', 'unavailable'].includes(item.source) &&
    item.verified === false &&
    item.currency === 'USD' &&
    typeof item.notes === 'string' &&
    item.notes.length <= 1000
  );
}
