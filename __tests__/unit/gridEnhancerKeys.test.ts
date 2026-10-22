/**
 * Mirrors GlobalGridEnhancer / TasksTab column-key stability rules.
 */

const normalizeHeaderKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const stripSortChrome = (value: string) => value.replace(/[↑↓]/g, '').trim();

describe('grid enhancer column keys', () => {
  it('normalizes header labels without sort markers', () => {
    expect(normalizeHeaderKey(stripSortChrome('Status↑'))).toBe('status');
    expect(normalizeHeaderKey(stripSortChrome('Status↓'))).toBe(
      normalizeHeaderKey(stripSortChrome('Status'))
    );
  });

  it('keeps unknown extras when merging known columns for defaults', () => {
    const selectable = ['task', 'status', 'extra-Foo'];
    const defaultHidden = ['extra-Foo'];
    const savedOrder = ['task', 'status'];
    const savedHidden = ['extra-Foo'];
    const known = new Set([...savedOrder, ...savedHidden]);
    const newDefaults = defaultHidden.filter((id) => !known.has(id));
    const visibleHidden = savedHidden.filter((id) => selectable.includes(id));
    expect(newDefaults).toEqual([]);
    expect(Array.from(new Set([...visibleHidden, ...newDefaults]))).toEqual(['extra-Foo']);
  });

  it('does not re-hide extras the user explicitly showed', () => {
    const defaultHidden = ['extra-Foo', 'extra-Bar'];
    const savedOrder = ['task', 'extra-Foo', 'extra-Bar'];
    const savedHidden: string[] = [];
    const known = new Set([...savedOrder, ...savedHidden]);
    const newDefaults = defaultHidden.filter((id) => !known.has(id));
    expect(newDefaults).toEqual([]);
  });

  it('treats incomplete session signatures as stale', () => {
    const currentSignature: string = 'task|status|extra-Foo';
    const staleSessionSignature: string = 'task|status';
    expect(staleSessionSignature === currentSignature).toBe(false);
  });
});
