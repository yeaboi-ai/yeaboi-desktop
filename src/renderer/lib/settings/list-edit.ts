// List-valued settings, as data. The engine stores them separator-joined and
// serves the parsed entries beside the joined value; these are the operations
// an editor performs between the two.
//
// Pure on purpose: the suite is node-only, so anything a test needs to assert
// lives here rather than inside a component.

/** Entries from a stored comma-joined value, trimmed, blanks dropped. */
export function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The stored form of a list of entries. */
export function joinCsv(items: string[]): string {
  return items.join(',');
}

/** Append `item` unless it is blank or already present. Order is preserved. */
export function addUnique(items: string[], item: string): string[] {
  const value = item.trim();
  if (!value || items.includes(value)) return items;
  return [...items, value];
}

/** Replace the entry at `index`, dropping it if the replacement duplicates another. */
export function replaceAt(items: string[], index: number, item: string): string[] {
  const value = item.trim();
  if (!value || index < 0 || index >= items.length) return items;
  if (items.some((existing, i) => i !== index && existing === value)) {
    return items.filter((_, i) => i !== index);
  }
  return items.map((existing, i) => (i === index ? value : existing));
}

/** Drop the entry at `index`. */
export function removeAt(items: string[], index: number): string[] {
  return items.filter((_, i) => i !== index);
}

/**
 * Whether `value` is shaped like an email address.
 *
 * Deliberately loose, and the same shape the engine validates against: a
 * strict RFC-5322 pattern refuses addresses that deliver.
 */
export function isEmailish(value: string): boolean {
  return /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(value.trim());
}
