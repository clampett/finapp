type AccountDraft = { accountId?: number | null; accountName?: string | null };
type CategoryDraft = { categoryId?: number | null; categoryName?: string | null };

export function changeAccount<T extends AccountDraft>(
  draft: T,
  name: string,
  accounts: { id: number; name: string }[],
): T {
  // Replaced the old account ID together with its label, including the legacy Checking alias.
  const normalize = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return normalized === 'checking account' ? 'checking' : normalized;
  };
  const account = accounts.find((item) => normalize(item.name) === normalize(name));
  return { ...draft, accountId: account?.id ?? null, accountName: name };
}

export function changeCategory<T extends CategoryDraft>(draft: T, name: string): T {
  // Cleared the retained ID so the backend resolved the newly typed category name.
  return { ...draft, categoryId: null, categoryName: name };
}

export function changeKind<T extends CategoryDraft & { kind: 'income' | 'expense' }>(
  draft: T,
  kind: T['kind'],
): T {
  // Cleared the old category when its income/expense kind was changed.
  return draft.kind === kind ? draft : { ...draft, kind, categoryId: null, categoryName: '' };
}
