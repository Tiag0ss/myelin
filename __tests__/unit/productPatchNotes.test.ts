import {
  mergeProductPatchNotesByApplication,
  validateProductVersionAppLinks,
} from '../../lib/productPatchNotes';

describe('mergeProductPatchNotesByApplication', () => {
  it('returns empty string when there are no sources', () => {
    expect(mergeProductPatchNotesByApplication([])).toBe('');
  });

  it('builds one h2 section per application ordered by name', () => {
    const html = mergeProductPatchNotesByApplication([
      {
        applicationId: 2,
        applicationName: 'Zebra',
        applicationVersionId: 20,
        versionNumber: '2.0.0',
        patchNotes: '<ul><li><p>Zebra fix</p></li></ul>',
      },
      {
        applicationId: 1,
        applicationName: 'Alpha',
        applicationVersionId: 10,
        versionNumber: '1.0.0',
        patchNotes: '<p>Alpha note</p>',
      },
    ]);

    expect(html).toContain('<h2>Alpha 1.0.0</h2>');
    expect(html).toContain('<p>Alpha note</p>');
    expect(html).toContain('<h2>Zebra 2.0.0</h2>');
    expect(html).toContain('<ul><li><p>Zebra fix</p></li></ul>');
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Zebra'));
  });

  it('uses a placeholder when patch notes are empty', () => {
    const html = mergeProductPatchNotesByApplication([
      {
        applicationId: 1,
        applicationName: 'Core',
        applicationVersionId: 5,
        versionNumber: '0.1.0',
        patchNotes: null,
      },
    ]);

    expect(html).toContain('<h2>Core 0.1.0</h2>');
    expect(html).toContain('<p><em>No patch notes for this application version.</em></p>');
  });

  it('escapes application names in section headings', () => {
    const html = mergeProductPatchNotesByApplication([
      {
        applicationId: 1,
        applicationName: 'A <B> & "C"',
        applicationVersionId: 1,
        versionNumber: '1.0',
        patchNotes: '<p>ok</p>',
      },
    ]);

    expect(html).toContain('<h2>A &lt;B&gt; &amp; &quot;C&quot; 1.0</h2>');
    expect(html).not.toContain('<h2>A <B>');
  });
});

describe('validateProductVersionAppLinks', () => {
  it('accepts unique valid links', () => {
    const result = validateProductVersionAppLinks([
      { applicationId: 1, applicationVersionId: 10 },
      { applicationId: 2, applicationVersionId: 20 },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it('rejects duplicate catalog applications', () => {
    const result = validateProductVersionAppLinks([
      { applicationId: 1, applicationVersionId: 10 },
      { applicationId: 1, applicationVersionId: 11 },
    ]);
    expect(result).toEqual({
      ok: false,
      message: 'Only one application version is allowed per catalog application',
    });
  });

  it('rejects apps outside the product catalog', () => {
    const result = validateProductVersionAppLinks(
      [{ applicationId: 3, applicationVersionId: 30 }],
      { catalogApplicationIds: new Set([1, 2]) }
    );
    expect(result).toEqual({
      ok: false,
      message: 'Application is not in the product catalog',
    });
  });

  it('rejects versions that do not belong to the selected application', () => {
    const result = validateProductVersionAppLinks(
      [{ applicationId: 1, applicationVersionId: 99 }],
      {
        catalogApplicationIds: new Set([1]),
        versionToApplicationId: new Map([[99, 2]]),
      }
    );
    expect(result).toEqual({
      ok: false,
      message: 'Application version does not belong to the selected application',
    });
  });

  it('rejects missing application versions when a map is provided', () => {
    const result = validateProductVersionAppLinks(
      [{ applicationId: 1, applicationVersionId: 99 }],
      {
        catalogApplicationIds: new Set([1]),
        versionToApplicationId: new Map(),
      }
    );
    expect(result).toEqual({
      ok: false,
      message: 'Application version not found',
    });
  });

  it('rejects invalid ids', () => {
    expect(
      validateProductVersionAppLinks([{ applicationId: 0, applicationVersionId: 1 }])
    ).toEqual({ ok: false, message: 'Invalid applicationId in links' });

    expect(
      validateProductVersionAppLinks([{ applicationId: 1, applicationVersionId: -1 }])
    ).toEqual({ ok: false, message: 'Invalid applicationVersionId in links' });
  });
});
