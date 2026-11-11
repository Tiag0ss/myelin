import {
  DEFAULT_PROJECT_TASK_FILTERS,
  countProjectTaskFilterDeviations,
} from '../../components/projects/tasks/projectTaskFilters';

describe('countProjectTaskFilterDeviations', () => {
  it('returns 0 for defaults', () => {
    expect(countProjectTaskFilterDeviations(DEFAULT_PROJECT_TASK_FILTERS)).toBe(0);
  });

  it('counts unchecked default hide toggles so Clear can restore them', () => {
    expect(
      countProjectTaskFilterDeviations({
        ...DEFAULT_PROJECT_TASK_FILTERS,
        hideClosed: false,
        hideCancelled: false,
      })
    ).toBe(2);
  });

  it('counts extra filters on top of defaults', () => {
    expect(
      countProjectTaskFilterDeviations({
        ...DEFAULT_PROJECT_TASK_FILTERS,
        filterText: 'api',
        unplannedOnly: true,
      })
    ).toBe(2);
  });
});
