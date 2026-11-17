import {
  mergeRelatedApplicationIds,
  normalizeApplicationIds,
} from '../../server/utils/taskApplications';

describe('normalizeApplicationIds', () => {
  it('dedupes and sorts positive ids', () => {
    expect(normalizeApplicationIds([3, '1', 2, 1, 0, -1, 'x', null])).toEqual([1, 2, 3]);
  });

  it('returns empty for non-arrays', () => {
    expect(normalizeApplicationIds(null)).toEqual([]);
    expect(normalizeApplicationIds(undefined)).toEqual([]);
  });
});

describe('mergeRelatedApplicationIds', () => {
  it('unions selected, primary, and linked application ids', () => {
    expect(
      mergeRelatedApplicationIds({
        selectedIds: [2, 5],
        primaryApplicationId: 1,
        linkedApplicationIds: [5, 7],
      })
    ).toEqual([1, 2, 5, 7]);
  });

  it('ignores empty/invalid values', () => {
    expect(
      mergeRelatedApplicationIds({
        selectedIds: [],
        primaryApplicationId: null,
        linkedApplicationIds: [0, NaN],
      })
    ).toEqual([]);
  });
});
