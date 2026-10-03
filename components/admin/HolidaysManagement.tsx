'use client';


import { useI18n } from '@/lib/i18n/provider';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api/config';
import { COUNTRY_OPTIONS } from '@/lib/constants/countries';
import SearchableSelect from '@/components/SearchableSelect';
import { useToast } from '@/contexts/ToastContext';

interface HolidayItem {
  Id: number;
  Year: number;
  CountryCode: string;
  RegionCode: string | null;
  HolidayDate: string;
  HolidayName: string;
  Source: string;
  IsActive: number;
}

interface Subdivision {
  code: string;
  name: string;
}

export default function HolidaysManagement() {
  const { t } = useI18n();

  const { token } = useAuth();
  const { showToast } = useToast();
  const countryOptions = COUNTRY_OPTIONS.map((country) => ({
    value: country.code,
    label: `${country.name} (${country.code})`
  }));
  const [holidayYear, setHolidayYear] = useState<number>(new Date().getFullYear());
  const [holidayCountryCode, setHolidayCountryCode] = useState<string>('PT');
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [holidayRegionCode, setHolidayRegionCode] = useState('');
  const [municipalitySelectValue, setMunicipalitySelectValue] = useState('');
  const [municipalityNewText, setMunicipalityNewText] = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | 'national' | string>('all');
  const [subdivisions, setSubdivisions] = useState<Subdivision[]>([]);
  const [selectedSubdivision, setSelectedSubdivision] = useState('');
  const [regionalSource, setRegionalSource] = useState<'openholidays' | 'nager'>('openholidays');
  const [loadingSubdivisions, setLoadingSubdivisions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingOpenHolidays, setIsImportingOpenHolidays] = useState(false);
  const [isImportingRegional, setIsImportingRegional] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (token) {
      loadHolidays(holidayYear, holidayCountryCode);
    }
  }, [token, holidayYear, holidayCountryCode]);

  useEffect(() => {
    if (token && holidayCountryCode) {
      loadSubdivisions(holidayCountryCode, holidayYear, regionalSource);
    }
  }, [token, holidayCountryCode, holidayYear, regionalSource]);

  const loadSubdivisions = async (countryCode: string, year: number, source: 'openholidays' | 'nager') => {
    if (!token) return;
    try {
      setLoadingSubdivisions(true);
      setSelectedSubdivision('');
      const url = source === 'nager'
        ? `${getApiUrl()}/api/holidays/nager-counties/${countryCode}/${year}`
        : `${getApiUrl()}/api/holidays/subdivisions/${countryCode}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setSubdivisions(data.subdivisions || []);
    } catch {
      setSubdivisions([]);
    } finally {
      setLoadingSubdivisions(false);
    }
  };

  const loadHolidays = async (year: number, countryCode: string) => {
    if (!token) return;

    try {
      setIsLoading(true);
      setError('');

      const response = await fetch(
        `${getApiUrl()}/api/holidays?year=${year}&countryCode=${countryCode}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToLoadHolidays'));
      }

      setHolidays(data.holidays || []);
    } catch (err: any) {
      setError(err.message || t('lit.failedToLoadHolidays'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!holidayDate || !holidayName.trim()) {
      setError(t('lit.dateAndHolidayNameAreRequired'));
      return;
    }

    try {
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiUrl()}/api/holidays`, {
        method: t('lit.post'),
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: holidayYear,
          countryCode: holidayCountryCode,
          holidayDate,
          holidayName: holidayName.trim(),
          regionCode: holidayRegionCode.trim() || null,
          isActive: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToAddHoliday'));
      }

      setHolidayDate('');
      setHolidayName('');
      setHolidayRegionCode('');
      setMunicipalitySelectValue('');
      setMunicipalityNewText('');
      setSuccess(t('lit.holidayAddedSuccessfully'));
      showToast({ type: 'success', title: t('lit.holiday'), message: t('lit.holidayAddedSuccessfully') });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || t('lit.failedToAddHoliday'));
    }
  };

  const handleDeleteHoliday = async (holidayId: number) => {
    if (!token) return;

    try {
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiUrl()}/api/holidays/${holidayId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToDeleteHoliday'));
      }

      setSuccess(t('lit.holidayDeletedSuccessfully'));
      showToast({ type: 'success', title: t('lit.holiday'), message: t('lit.holidayDeletedSuccessfully') });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || t('lit.failedToDeleteHoliday'));
    }
  };

  const handleImportFromNagerDate = async () => {
    if (!token) return;

    try {
      setIsImporting(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiUrl()}/api/holidays/import/nager-date`, {
        method: t('lit.post'),
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: holidayYear,
          countryCode: holidayCountryCode,
          replaceExisting: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToImportHolidays'));
      }

      setSuccess(`Imported ${data.inserted || 0} holidays from Nager.Date`);
      showToast({ type: 'success', title: t('lit.holidaysImported'), message: `Imported ${data.inserted || 0} holidays from Nager.Date` });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || t('lit.failedToImportHolidays'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFromOpenHolidays = async () => {
    if (!token) return;

    try {
      setIsImportingOpenHolidays(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiUrl()}/api/holidays/import/openholidays`, {
        method: t('lit.post'),
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: holidayYear,
          countryCode: holidayCountryCode,
          replaceExisting: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToImportHolidays'));
      }

      setSuccess(`Imported ${data.inserted || 0} holidays from OpenHolidays API`);
      showToast({ type: 'success', title: t('lit.holidaysImported'), message: `Imported ${data.inserted || 0} holidays from OpenHolidays API` });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || t('lit.failedToImportHolidays'));
    } finally {
      setIsImportingOpenHolidays(false);
    }
  };

  const handleImportRegional = async () => {
    if (!token || !selectedSubdivision) return;

    try {
      setIsImportingRegional(true);
      setError('');
      setSuccess('');

      const endpoint = regionalSource === 'nager'
        ? `${getApiUrl()}/api/holidays/import/nager-regional`
        : `${getApiUrl()}/api/holidays/import/openholidays-regional`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: holidayYear,
          countryCode: holidayCountryCode,
          subdivisionCode: selectedSubdivision,
          replaceExisting: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToImportRegionalHolidays'));
      }

      const subName = subdivisions.find((s) => s.code === selectedSubdivision)?.name || selectedSubdivision;
      setSuccess(`Imported ${data.inserted || 0} regional holidays for ${subName}`);
      showToast({ type: 'success', title: t('lit.regionalHolidaysImported'), message: `Imported ${data.inserted || 0} holidays for ${subName}` });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || t('lit.failedToImportRegionalHolidays'));
    } finally {
      setIsImportingRegional(false);
    }
  };

  // Compute available region codes for the filter dropdown
  const availableRegions = Array.from(
    new Set(holidays.map((h) => h.RegionCode).filter(Boolean))
  ).sort() as string[];

  // Municipalities = regions in DB that are NOT formal API subdivisions
  const existingMunicipalities = availableRegions.filter(
    (r) => !subdivisions.find((s) => s.code === r)
  );

  const filteredHolidays = holidays.filter((h) => {
    if (regionFilter === 'all') return true;
    if (regionFilter === 'national') return !h.RegionCode;
    return h.RegionCode === regionFilter;
  });

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-[var(--pm-muted)]">
          {t('lit.configureNationalRegionalAndMunicipalHolidaysPerYearAndCountry')}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.year')}</label>
            <input
              type="number"
              value={holidayYear}
              onChange={(e) => setHolidayYear(parseInt(e.target.value || String(new Date().getFullYear()), 10))}
              className="w-24 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
            />
          </div>
          <div className="min-w-[12rem]">
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.country')}</label>
            <SearchableSelect
              value={holidayCountryCode}
              onChange={(value) => setHolidayCountryCode(value || 'PT')}
              options={countryOptions}
              placeholder={t('lit.country')}
              emptyText=""
              className="w-full"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded border border-green-400 bg-green-100 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
          {success}
        </div>
      )}

      <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('common.import')}</h3>
          <p className="text-[11px] text-[var(--pm-muted)]">
            {t('lit.nationalImportsFillTheYearRegionalImportTargetsOneSubdivision')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleImportFromNagerDate}
            disabled={isImporting}
            title={t('lit.importsNationalRegionalHolidaysWithCountyCodes')}
            className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
          >
            {isImporting ? 'Importing…' : t('lit.importNagerDate')}
          </button>
          <button
            type="button"
            onClick={handleImportFromOpenHolidays}
            disabled={isImportingOpenHolidays}
            title={t('lit.importsNationalHolidaysOnly')}
            className="h-9 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-400"
          >
            {isImportingOpenHolidays ? 'Importing…' : t('lit.importOpenholidays')}
          </button>
        </div>

        <div className="border-t border-[var(--pm-border)] pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--pm-muted)]">{t('lit.regionalSubdivision')}</span>
            <div className="inline-flex items-center rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] p-0.5">
              {(['openholidays', 'nager'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setRegionalSource(src)}
                  className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
                    regionalSource === src
                      ? 'bg-[var(--pm-accent)] text-[var(--pm-bg)]'
                      : 'text-[var(--pm-muted)] hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]'
                  }`}
                >
                  {src === 'openholidays' ? 'OpenHolidays' : t('lit.nagerDate')}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              {loadingSubdivisions ? (
                <p className="py-1.5 text-sm text-[var(--pm-muted)]">{t('common.loading')}</p>
              ) : subdivisions.length === 0 ? (
                <p className="py-1.5 text-sm italic text-[var(--pm-muted)]">
                  {t('lit.noSubdivisionsAvailableForThisCountrySource')}
                </p>
              ) : (
                <select
                  value={selectedSubdivision}
                  onChange={(e) => setSelectedSubdivision(e.target.value)}
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                >
                  <option value="">— select a region —</option>
                  {subdivisions.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name !== s.code ? `${s.name} (${s.code})` : s.code}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button
              type="button"
              onClick={handleImportRegional}
              disabled={isImportingRegional || !selectedSubdivision}
              className="h-9 shrink-0 rounded-lg bg-indigo-500 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:bg-gray-400"
            >
              {isImportingRegional ? 'Importing…' : t('lit.importRegion')}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.addHoliday')}</h3>
          <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
            {t('lit.useForMunicipalLocalHolidaysNotAvailableViaImportApis')}
          </p>
        </div>
        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('common.date')}</label>
            <input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.holidayName')}</label>
            <input
              type="text"
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
              placeholder={t('lit.eGDiaDoMunicipioDeConstancia')}
              className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.regionSubdivision')}</label>
            <select
              value={holidayRegionCode && subdivisions.find((s) => s.code === holidayRegionCode) ? holidayRegionCode : ''}
              onChange={(e) => {
                const val = e.target.value;
                setHolidayRegionCode(val);
                if (val) {
                  setMunicipalitySelectValue('');
                  setMunicipalityNewText('');
                }
              }}
              className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
            >
              <option value="">{t('lit.nationalMunicipality')}</option>
              {subdivisions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name !== s.code ? `${s.name} (${s.code})` : s.code}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.municipalityOptional')}</label>
            {subdivisions.find((s) => s.code === holidayRegionCode) ? (
              <p className="py-1.5 text-xs italic text-[var(--pm-muted)]">
                {t('lit.notApplicableWhenASubdivisionIsSelected')}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5 sm:flex-row">
                <select
                  value={municipalitySelectValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMunicipalitySelectValue(val);
                    if (val === '__new__') {
                      setHolidayRegionCode(municipalityNewText);
                    } else {
                      setHolidayRegionCode(val);
                      setMunicipalityNewText('');
                    }
                  }}
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                >
                  <option value="">— National (no municipality) —</option>
                  {existingMunicipalities.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value="__new__">+ Add new municipality…</option>
                </select>
                {municipalitySelectValue === '__new__' && (
                  <input
                    type="text"
                    value={municipalityNewText}
                    onChange={(e) => {
                      setMunicipalityNewText(e.target.value);
                      setHolidayRegionCode(e.target.value);
                    }}
                    placeholder={t('lit.eGConstancia')}
                    autoFocus
                    className="w-full rounded-md border border-[var(--pm-accent)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)] sm:max-w-xs"
                  />
                )}
              </div>
            )}
          </div>
          <div className="flex items-end justify-end md:col-span-2 lg:col-span-1">
            <button
              type="submit"
              className="h-9 w-full rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700 sm:w-auto"
            >
              {t('lit.addHoliday2')}
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pm-border)] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
            Holidays ({filteredHolidays.length})
          </span>
          {(availableRegions.length > 0 || holidays.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[var(--pm-muted)]">{t('lit.show2')}</span>
              {[
                { key: 'all', label: t('lit.all') },
                { key: 'national', label: t('lit.national') },
                ...availableRegions.map((r) => {
                  const sub = subdivisions.find((s) => s.code === r);
                  return { key: r, label: sub ? `${sub.name} (${r})` : r };
                }),
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRegionFilter(key as typeof regionFilter)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    regionFilter === key
                      ? 'border-[var(--pm-accent)] bg-[var(--pm-accent)] text-[var(--pm-bg)]'
                      : 'border-[var(--pm-border)] text-[var(--pm-muted)] hover:border-[var(--pm-accent)] hover:text-[var(--pm-text)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--pm-border)]">
            <thead className="bg-[var(--pm-panel)]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">{t('common.date')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">{t('common.name')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.region')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.source')}</th>
                <th scope="col" className="relative px-3 py-2">
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--pm-border)]">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-[var(--pm-muted)]">
                    {t('lit.loadingHolidays')}
                  </td>
                </tr>
              ) : filteredHolidays.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-[var(--pm-muted)]">
                    {t('lit.noHolidaysConfiguredForThisYearCountry')}
                  </td>
                </tr>
              ) : (
                filteredHolidays.map((holiday) => (
                  <tr key={holiday.Id} className="hover:bg-[var(--pm-panel)]">
                    <td className="px-3 py-2 text-sm tabular-nums text-[var(--pm-text)]">
                      {String(holiday.HolidayDate).split('T')[0]}
                    </td>
                    <td className="px-3 py-2 text-sm text-[var(--pm-text)]">{holiday.HolidayName}</td>
                    <td className="px-3 py-2 text-sm">
                      {holiday.RegionCode ? (
                        <span
                          className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          title={holiday.RegionCode}
                        >
                          {subdivisions.find((s) => s.code === holiday.RegionCode)?.name || holiday.RegionCode}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--pm-muted)]">{t('lit.national')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-[var(--pm-muted)]">{holiday.Source}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(holiday.Id)}
                        title={t('lit.deleteHoliday')}
                        aria-label={t('lit.deleteHoliday')}
                        className="rounded p-1.5 text-[var(--pm-muted)] transition-colors hover:text-red-600 dark:hover:text-red-400"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
