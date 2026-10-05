/** '2026-10-03' → '03-Oct-2026', the way the store writes dates. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(m) - 1];
  return month ? `${d}-${month}-${y}` : iso;
}

/** '2026-10-03T11:42:10' (IST wall clock) → '03-Oct-2026 11:42'. */
export function formatDateTime(local: string | null | undefined): string {
  if (!local) return '—';
  return `${formatDate(local)} ${local.slice(11, 16)}`.trim();
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function itemLabel(item: { itemCode: string | null; itemName: string | null }): string {
  return [item.itemCode, item.itemName].filter(Boolean).join(' · ');
}
