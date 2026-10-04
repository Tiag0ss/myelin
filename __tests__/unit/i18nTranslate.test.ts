import { composeMessages, translate } from '../../lib/i18n/translate';
import { setI18nRuntime, t } from '../../lib/i18n/runtime';

describe('i18n translate runtime', () => {
  it('translates lit keys from the active runtime map without bundling JSON', () => {
    setI18nRuntime('pt', { save: 'Guardar', weekN: 'Semana {n}' }, { save: 'Save', weekN: 'Week {n}' });
    expect(t('lit.save')).toBe('Guardar');
    expect(t('lit.weekN', { n: 3 })).toBe('Semana 3');
    expect(t('common.cancel')).toBeTruthy();
  });

  it('falls back to English lit when key missing in active locale', () => {
    const pt = composeMessages('pt', {});
    const en = composeMessages('en', { onlyInEn: 'Only EN' });
    expect(translate(pt, en, 'lit.onlyInEn')).toBe('Only EN');
  });
});
