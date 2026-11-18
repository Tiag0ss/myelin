import {
  defaultApplicationIdsForTask,
  expandTasksToApplicationTaskIds,
  mergeSeededTasksFromVersions,
  parseWizardProjectIds,
  serializeWizardProjectIds,
} from '../../lib/productReleaseWizard';
import {
  buildWizardProductPatchNotes,
  prependRelatedApplicationVersionsSection,
  splitRelatedApplicationVersionsSection,
} from '../../lib/productPatchNotes';

describe('defaultApplicationIdsForTask', () => {
  it('prefers task apps intersecting the catalog', () => {
    expect(
      defaultApplicationIdsForTask(
        { taskId: 1, primaryApplicationId: 10, relatedApplicationIds: [20, 99] },
        [10, 20, 30],
        [30]
      )
    ).toEqual([10, 20]);
  });

  it('falls back to project ∩ catalog when task has no catalog apps', () => {
    expect(
      defaultApplicationIdsForTask(
        { taskId: 1, primaryApplicationId: 99, relatedApplicationIds: [] },
        [10, 20, 30],
        [20, 30]
      )
    ).toEqual([20, 30]);
  });

  it('returns empty when neither task nor project maps into catalog', () => {
    expect(
      defaultApplicationIdsForTask(
        { taskId: 1, primaryApplicationId: null, relatedApplicationIds: [] },
        [10, 20],
        []
      )
    ).toEqual([]);
  });
});

describe('expandTasksToApplicationTaskIds', () => {
  it('allows the same task under multiple applications', () => {
    const map = expandTasksToApplicationTaskIds(
      [
        { taskId: 1, applicationIds: [10, 20] },
        { taskId: 2, applicationIds: [20] },
      ],
      [10, 20, 30]
    );
    expect(map.get(10)).toEqual([1]);
    expect(map.get(20)).toEqual([1, 2]);
    expect(map.get(30)).toEqual([]);
  });
});

describe('WizardProjectIds helpers', () => {
  it('serializes and parses project ids', () => {
    expect(serializeWizardProjectIds([3, 1, 1, 2])).toBe('1,2,3');
    expect(parseWizardProjectIds('1,2,3')).toEqual([1, 2, 3]);
    expect(serializeWizardProjectIds([])).toBeNull();
    expect(parseWizardProjectIds(null)).toEqual([]);
  });
});

describe('mergeSeededTasksFromVersions', () => {
  it('unions apps per task from linked versions', () => {
    const map = mergeSeededTasksFromVersions([
      { taskId: 1, applicationId: 10 },
      { taskId: 1, applicationId: 20 },
      { taskId: 2, applicationId: 10 },
    ]);
    expect([...map.get(1)!].sort()).toEqual([10, 20]);
    expect([...map.get(2)!]).toEqual([10]);
  });
});

describe('buildWizardProductPatchNotes', () => {
  it('prepends related application versions then builds a task changelog with issue links', () => {
    const html = buildWizardProductPatchNotes(
      [
        {
          applicationId: 2,
          applicationName: 'Web',
          applicationVersionId: 22,
          versionNumber: '1.0.0',
          patchNotes: '<p>Should not be copied</p>',
        },
        {
          applicationId: 1,
          applicationName: 'API',
          applicationVersionId: 11,
          versionNumber: '1.0.0',
          versionName: 'Core',
          patchNotes: '<p>Should not be copied</p>',
        },
      ],
      {
        tasks: [
          {
            Id: 10,
            TaskName: 'Fix login',
            ProjectName: 'Core',
            TaskTypeName: 'Bug',
            JiraIssueKey: 'PROJ-12',
            JiraUrl: 'https://jira.example',
          },
          {
            Id: 11,
            TaskName: 'Add export',
            ProjectName: 'Core',
            TicketId: 41,
            TicketNumber: 41,
          },
        ],
      }
    );

    expect(html).toContain('<h2>Related application versions</h2>');
    expect(html).toContain('<li>API 1.0.0 (Core)</li>');
    expect(html).toContain('<li>Web 1.0.0</li>');
    expect(html).not.toContain('Should not be copied');
    expect(html).not.toContain('<h2>API 1.0.0</h2>');
    expect(html).toContain('href="https://jira.example/browse/PROJ-12"');
    expect(html).toContain('[PROJ-12]');
    expect(html).toContain('Fix login');
    expect(html).toContain('href="/tickets/41"');
    expect(html).toContain('[#41]');
    expect(html).toContain('Add export');
    expect(html.indexOf('Related application versions')).toBeLessThan(html.indexOf('Fix login'));
  });
});

describe('splitRelatedApplicationVersionsSection', () => {
  it('extracts the related block and leaves the changelog body', () => {
    const html = [
      '<h2>Related application versions</h2>',
      '<ul><li>Billing Addon 2.6.2.0</li><li>Meylin 1.0.5</li></ul>',
      '<p><strong>Bug</strong></p>',
      '<ul><li>Fix login</li></ul>',
    ].join('\n');

    const { relatedSection, body } = splitRelatedApplicationVersionsSection(html);
    expect(relatedSection).toContain('<h2>Related application versions</h2>');
    expect(relatedSection).toContain('Billing Addon 2.6.2.0');
    expect(body).toContain('Fix login');
    expect(body).not.toContain('Related application versions');
  });

  it('re-attaches the related block ahead of improved body and drops duplicates', () => {
    const related =
      '<h2>Related application versions</h2>\n<ul><li>Billing Addon 2.6.2.0</li></ul>';
    const improved =
      '<h2>Related application versions</h2>\n<ul><li>Wrong</li></ul>\n<ul><li>Improved fix</li></ul>';
    const merged = prependRelatedApplicationVersionsSection(related, improved);
    expect(merged.startsWith('<h2>Related application versions</h2>')).toBe(true);
    expect(merged).toContain('Billing Addon 2.6.2.0');
    expect(merged).not.toContain('Wrong');
    expect(merged).toContain('Improved fix');
  });
});
