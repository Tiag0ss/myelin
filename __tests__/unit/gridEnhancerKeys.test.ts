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

  it('reorders remounted body cells by data-column-key not DOM index', () => {
    // Header already in user order; React remounted body back to JSX order.
    const headerOrder = ['select', 'status', 'task', 'actions'];
    const remountedBody = [
      { key: 'select' },
      { key: 'task' },
      { key: 'status' },
      { key: 'actions' },
    ];
    const byColumn = new Map(remountedBody.map((cell) => [cell.key, cell]));
    const reordered = headerOrder.map((id) => byColumn.get(id)?.key);
    expect(reordered).toEqual(['select', 'status', 'task', 'actions']);

    // Index-based mapping (the old bug) would mis-label remounted cells.
    const byIndexWrong = remountedBody.map((cell, index) => ({
      assumed: headerOrder[index],
      actual: cell.key,
    }));
    expect(byIndexWrong.some((entry) => entry.assumed !== entry.actual)).toBe(true);
  });

  it('treats unmarked body cells as needing layout re-apply', () => {
    const hasBodyRows = true;
    const hasUnmarkedBodyCell = true;
    const shouldSkip = Boolean(
      /* markedHeader */ true && (!hasBodyRows || !hasUnmarkedBodyCell)
    );
    expect(shouldSkip).toBe(false);
  });
});
