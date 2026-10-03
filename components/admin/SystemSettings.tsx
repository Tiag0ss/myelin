'use client';

import { t as tPath } from '@/lib/i18n/messages';
import { readLocaleStorage, type Locale } from '@/lib/i18n/config';

function localeNow(): Locale {
  return (readLocaleStorage() as Locale) || 'en';
}
function t(path: string, vars?: Record<string, string | number>): string {
  return tPath(localeNow(), path, vars);
}


import { useI18n } from '@/lib/i18n/provider';
import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import PageTabs from '@/components/PageTabs';
// Complete list of IANA timezones
const TIMEZONES = [
  { value: '', label: t('lit.useBrowserSystemDefault') },
  { value: 'UTC', label: t('lit.utcCoordinatedUniversalTime') },
  // Africa
  { value: t('lit.africaCairo'), label: t('lit.africaCairoEet') },
  { value: t('lit.africaCasablanca'), label: t('lit.africaCasablancaWet') },
  { value: t('lit.africaJohannesburg'), label: t('lit.africaJohannesburgSast') },
  { value: t('lit.africaLagos'), label: t('lit.africaLagosWat') },
  { value: t('lit.africaNairobi'), label: t('lit.africaNairobiEat') },
  // America
  { value: t('lit.americaAnchorage'), label: t('lit.americaAnchorageAkst') },
  { value: 'America/Argentina/Buenos_Aires', label: t('lit.americaBuenosAiresArt') },
  { value: t('lit.americaBogota'), label: t('lit.americaBogotaCot') },
  { value: t('lit.americaCaracas'), label: t('lit.americaCaracasVet') },
  { value: t('lit.americaChicago'), label: t('lit.americaChicagoCst') },
  { value: t('lit.americaDenver'), label: t('lit.americaDenverMst') },
  { value: t('lit.americaHalifax'), label: t('lit.americaHalifaxAst') },
  { value: t('lit.americaLima'), label: t('lit.americaLimaPet') },
  { value: 'America/Los_Angeles', label: t('lit.americaLosAngelesPst') },
  { value: 'America/Mexico_City', label: t('lit.americaMexicoCityCst') },
  { value: 'America/New_York', label: t('lit.americaNewYorkEst') },
  { value: t('lit.americaPhoenix'), label: t('lit.americaPhoenixMst') },
  { value: t('lit.americaSantiago'), label: t('lit.americaSantiagoClt') },
  { value: 'America/Sao_Paulo', label: t('lit.americaSaoPauloBrt') },
  { value: 'America/St_Johns', label: t('lit.americaStJohnsNst') },
  { value: t('lit.americaToronto'), label: t('lit.americaTorontoEst') },
  { value: t('lit.americaVancouver'), label: t('lit.americaVancouverPst') },
  // Asia
  { value: t('lit.asiaBaghdad'), label: t('lit.asiaBaghdadAst') },
  { value: t('lit.asiaBangkok'), label: t('lit.asiaBangkokIct') },
  { value: t('lit.asiaColombo'), label: t('lit.asiaColomboIst') },
  { value: t('lit.asiaDubai'), label: t('lit.asiaDubaiGst') },
  { value: 'Asia/Hong_Kong', label: t('lit.asiaHongKongHkt') },
  { value: t('lit.asiaIstanbul'), label: t('lit.asiaIstanbulTrt') },
  { value: t('lit.asiaJakarta'), label: t('lit.asiaJakartaWib') },
  { value: t('lit.asiaJerusalem'), label: t('lit.asiaJerusalemIst') },
  { value: t('lit.asiaKarachi'), label: t('lit.asiaKarachiPkt') },
  { value: t('lit.asiaKathmandu'), label: t('lit.asiaKathmanduNpt') },
  { value: t('lit.asiaKolkata'), label: t('lit.asiaKolkataIst') },
  { value: 'Asia/Kuala_Lumpur', label: t('lit.asiaKualaLumpurMyt') },
  { value: t('lit.asiaManila'), label: t('lit.asiaManilaPht') },
  { value: t('lit.asiaSeoul'), label: t('lit.asiaSeoulKst') },
  { value: t('lit.asiaShanghai'), label: t('lit.asiaShanghaiCst') },
  { value: t('lit.asiaSingapore'), label: t('lit.asiaSingaporeSgt') },
  { value: t('lit.asiaTaipei'), label: t('lit.asiaTaipeiCst') },
  { value: t('lit.asiaTehran'), label: t('lit.asiaTehranIrst') },
  { value: t('lit.asiaTokyo'), label: t('lit.asiaTokyoJst') },
  // Atlantic
  { value: t('lit.atlanticAzores'), label: t('lit.atlanticAzoresAzot') },
  { value: t('lit.atlanticReykjavik'), label: t('lit.atlanticReykjavikGmt') },
  // Australia
  { value: t('lit.australiaAdelaide'), label: t('lit.australiaAdelaideAcst') },
  { value: t('lit.australiaBrisbane'), label: t('lit.australiaBrisbaneAest') },
  { value: t('lit.australiaDarwin'), label: t('lit.australiaDarwinAcst') },
  { value: t('lit.australiaMelbourne'), label: t('lit.australiaMelbourneAest') },
  { value: t('lit.australiaPerth'), label: t('lit.australiaPerthAwst') },
  { value: t('lit.australiaSydney'), label: t('lit.australiaSydneyAest') },
  // Europe
  { value: t('lit.europeAmsterdam'), label: t('lit.europeAmsterdamCet') },
  { value: t('lit.europeAthens'), label: t('lit.europeAthensEet') },
  { value: t('lit.europeBerlin'), label: t('lit.europeBerlinCet') },
  { value: t('lit.europeBrussels'), label: t('lit.europeBrusselsCet') },
  { value: t('lit.europeBucharest'), label: t('lit.europeBucharestEet') },
  { value: t('lit.europeBudapest'), label: t('lit.europeBudapestCet') },
  { value: t('lit.europeCopenhagen'), label: t('lit.europeCopenhagenCet') },
  { value: t('lit.europeDublin'), label: t('lit.europeDublinGmt') },
  { value: t('lit.europeHelsinki'), label: t('lit.europeHelsinkiEet') },
  { value: t('lit.europeLisbon'), label: t('lit.europeLisbonWet') },
  { value: t('lit.europeLondon'), label: t('lit.europeLondonGmt') },
  { value: t('lit.europeMadrid'), label: t('lit.europeMadridCet') },
  { value: t('lit.europeMoscow'), label: t('lit.europeMoscowMsk') },
  { value: t('lit.europeOslo'), label: t('lit.europeOsloCet') },
  { value: t('lit.europeParis'), label: t('lit.europeParisCet') },
  { value: t('lit.europePrague'), label: t('lit.europePragueCet') },
  { value: t('lit.europeRome'), label: t('lit.europeRomeCet') },
  { value: t('lit.europeStockholm'), label: t('lit.europeStockholmCet') },
  { value: t('lit.europeVienna'), label: t('lit.europeViennaCet') },
  { value: t('lit.europeWarsaw'), label: t('lit.europeWarsawCet') },
  { value: t('lit.europeZurich'), label: t('lit.europeZurichCet') },
  // Indian
  { value: t('lit.indianMauritius'), label: t('lit.indianMauritiusMut') },
  // Pacific
  { value: t('lit.pacificAuckland'), label: t('lit.pacificAucklandNzst') },
  { value: t('lit.pacificFiji'), label: t('lit.pacificFijiFjt') },
  { value: t('lit.pacificGuam'), label: t('lit.pacificGuamChst') },
  { value: t('lit.pacificHonolulu'), label: t('lit.pacificHonoluluHst') },
  { value: t('lit.pacificSamoa'), label: t('lit.pacificSamoaSst') },
];

interface SystemSettings {
  companyName?: string;
  companyLogoUrl?: string;
  faviconUrl?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom?: string;
  smtpFromName?: string;
  smtpSecure?: string;
  outlookCalendarEnabled?: string;
  outlookTenantId?: string;
  outlookClientId?: string;
  outlookClientSecret?: string;
  outlookIncludeTeamEventsForManagers?: string;
  allowPublicRegistration?: string;
  publicRegistrationType?: string;
  defaultCustomerId?: string;
  defaultTimezone?: string;
  internalTicketsEnabled?: string;
  memosEnabled?: string;
  expensesEnabled?: string;
  autoApproveExpenses?: string;
  autoApproveTimeEntries?: string;
  autoApproveVacations?: string;
  autoApproveOutOfOffice?: string;
  frontpageEnabled?: string;
  aiAssistantEnabled?: string;
  aiProvider?: string;
  openAIApiKey?: string;
  openAIModel?: string;
  openAIBehavior?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  aiViewsAutoCreate?: string;
  aiViewSql_vAI_ProjectOpenTasks?: string;
  aiViewSql_vAI_UserOpenTasks?: string;
  aiViewSql_vAI_UserWorkloadBase?: string;
  aiViewSql_vAI_UserAllocations?: string;
}

interface Organization {
  Id: number;
  Name: string;
}

interface Customer {
  Id: number;
  Name: string;
}

type SettingsTab = 'branding' | 'email' | 'access' | 'features' | 'ai' | 'maintenance';

export type SystemSettingsActionsState = {
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  showSyncAiViews: boolean;
  syncingAiViews: boolean;
  onSyncAiViews: () => void;
};

type SystemSettingsProps = {
  /** Use `none` when the parent owns PageStickyActions (Administration). */
  actionsPlacement?: 'embedded' | 'none';
  onActionsStateChange?: (state: SystemSettingsActionsState | null) => void;
};

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'branding', label: t('lit.branding') },
  { id: 'email', label: t('lit.emailSmtp') },
  { id: 'access', label: t('lit.accessAuth') },
  { id: 'features', label: t('lit.features') },
  { id: 'ai', label: 'AI' },
  { id: 'maintenance', label: t('lit.maintenance') },
];

export default function SystemSettings({
  actionsPlacement = 'embedded',
  onActionsStateChange,
}: SystemSettingsProps) {
  const { t } = useI18n();

  const { token } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('branding');
  const formRef = useRef<HTMLFormElement>(null);
  const [settings, setSettings] = useState<SystemSettings>({
    companyName: 'Myelin',
    companyLogoUrl: '',
    faviconUrl: '',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: '',
    smtpFrom: '',
    smtpFromName: '',
    smtpSecure: 'true',
    outlookCalendarEnabled: 'false',
    outlookTenantId: '',
    outlookClientId: '',
    outlookClientSecret: '',
    outlookIncludeTeamEventsForManagers: 'true',
    allowPublicRegistration: 'false',
    publicRegistrationType: 'internal',
    defaultCustomerId: '',
    defaultTimezone: '',
    internalTicketsEnabled: 'true',
    memosEnabled: 'true',
    expensesEnabled: 'false',
    autoApproveExpenses: 'false',
    autoApproveTimeEntries: 'false',
    autoApproveVacations: 'false',
    autoApproveOutOfOffice: 'false',
    frontpageEnabled: 'true',
    aiAssistantEnabled: 'false',
    aiProvider: 'openai',
    openAIApiKey: '',
    openAIModel: 'gpt-4o-mini',
    openAIBehavior: '',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.2',
    aiViewsAutoCreate: 'true',
    aiViewSql_vAI_ProjectOpenTasks: '',
    aiViewSql_vAI_UserOpenTasks: '',
    aiViewSql_vAI_UserWorkloadBase: '',
    aiViewSql_vAI_UserAllocations: '',
  });
  const [_organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ created: number; skipped: number } | null>(null);
  const [migrationError, setMigrationError] = useState('');
  const [isSyncingAiViews, setIsSyncingAiViews] = useState(false);
  const smtpPasswordRef = useRef<HTMLInputElement>(null);
  const outlookClientSecretRef = useRef<HTMLInputElement>(null);
  const openAIApiKeyRef = useRef<HTMLInputElement>(null);
  const [aiViewsSyncMessage, setAiViewsSyncMessage] = useState('');
  const [aiViewsSyncError, setAiViewsSyncError] = useState('');
  const [isUploadingBranding, setIsUploadingBranding] = useState<'logo' | 'favicon' | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const faviconFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) {
      loadSettings();
      loadOrganizations();
      loadCustomers();
    }
  }, [token]);

  const loadSettings = async () => {
    if (!token) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(
        `${getApiUrl()}/api/system-settings`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSettings({
          companyName: data.settings.companyName || 'Myelin',
          companyLogoUrl: data.settings.companyLogoUrl || '',
          faviconUrl: data.settings.faviconUrl || '',
          smtpHost: data.settings.smtpHost || '',
          smtpPort: data.settings.smtpPort || '587',
          smtpUser: data.settings.smtpUser || '',
          smtpPassword: data.settings.smtpPassword || '',
          smtpFrom: data.settings.smtpFrom || '',
          smtpFromName: data.settings.smtpFromName || '',
          smtpSecure: data.settings.smtpSecure || 'true',
          outlookCalendarEnabled: data.settings.outlookCalendarEnabled || 'false',
          outlookTenantId: data.settings.outlookTenantId || '',
          outlookClientId: data.settings.outlookClientId || '',
          outlookClientSecret: data.settings.outlookClientSecret || '',
          outlookIncludeTeamEventsForManagers: data.settings.outlookIncludeTeamEventsForManagers || 'true',
          allowPublicRegistration: data.settings.allowPublicRegistration || 'false',
          publicRegistrationType: data.settings.publicRegistrationType || 'internal',
          defaultCustomerId: data.settings.defaultCustomerId || '',
          defaultTimezone: data.settings.defaultTimezone || '',
          internalTicketsEnabled: data.settings.internalTicketsEnabled || 'true',
          memosEnabled: data.settings.memosEnabled || 'true',
          expensesEnabled: data.settings.expensesEnabled || 'false',
          autoApproveExpenses: data.settings.autoApproveExpenses || 'false',
          autoApproveTimeEntries: data.settings.autoApproveTimeEntries || 'false',
          autoApproveVacations: data.settings.autoApproveVacations || 'false',
          autoApproveOutOfOffice: data.settings.autoApproveOutOfOffice || 'false',
          frontpageEnabled: data.settings.frontpageEnabled !== undefined ? data.settings.frontpageEnabled : 'true',
          aiAssistantEnabled: data.settings.aiAssistantEnabled || 'false',
          aiProvider: data.settings.aiProvider === 'ollama' ? 'ollama' : 'openai',
          openAIApiKey: data.settings.openAIApiKey || '',
          openAIModel: data.settings.openAIModel || 'gpt-4o-mini',
          openAIBehavior: data.settings.openAIBehavior || '',
          ollamaBaseUrl: data.settings.ollamaBaseUrl || 'http://127.0.0.1:11434',
          ollamaModel: data.settings.ollamaModel || 'llama3.2',
          aiViewsAutoCreate: data.settings.aiViewsAutoCreate || 'true',
          aiViewSql_vAI_ProjectOpenTasks: data.settings.aiViewSql_vAI_ProjectOpenTasks || '',
          aiViewSql_vAI_UserOpenTasks: data.settings.aiViewSql_vAI_UserOpenTasks || '',
          aiViewSql_vAI_UserWorkloadBase: data.settings.aiViewSql_vAI_UserWorkloadBase || '',
          aiViewSql_vAI_UserAllocations: data.settings.aiViewSql_vAI_UserAllocations || '',
        });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError(t('lit.failedToLoadSettings'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrganizations = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/organizations`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setOrganizations(data.organizations || []);
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  };

  const loadCustomers = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/customers`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        setCustomers(result.data || []);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const handleMigrateSystemGroups = async () => {
    if (!token) return;
    setIsMigrating(true);
    setMigrationResult(null);
    setMigrationError('');
    try {
      const response = await fetch(
        `${getApiUrl()}/api/organizations/admin/create-system-groups`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      const data = await response.json();
      if (response.ok && data.success) {
        setMigrationResult({ created: data.created, skipped: data.skipped });
      } else {
        setMigrationError(data.message || t('lit.migrationFailed'));
      }
    } catch (err: any) {
      setMigrationError(err.message || t('lit.migrationFailed'));
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSyncAiViews = async () => {
    if (!token) return;
    setIsSyncingAiViews(true);
    setAiViewsSyncMessage('');
    setAiViewsSyncError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/ai-assistant-views/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || t('lit.failedToSyncAiViews'));
      }

      setAiViewsSyncMessage(`AI views synced (${data.synced || 0} view(s)).`);
    } catch (err: any) {
      setAiViewsSyncError(err.message || t('lit.failedToSyncAiViews'));
    } finally {
      setIsSyncingAiViews(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      const settingsToSave: SystemSettings = { ...settings };
      const smtpPassword = readPasswordInput(smtpPasswordRef);
      const outlookClientSecret = readPasswordInput(outlookClientSecretRef);
      const openAIApiKey = readPasswordInput(openAIApiKeyRef);
      if (smtpPassword) settingsToSave.smtpPassword = smtpPassword;
      if (outlookClientSecret) settingsToSave.outlookClientSecret = outlookClientSecret;
      if (openAIApiKey) settingsToSave.openAIApiKey = openAIApiKey;

      const response = await fetch(
        `${getApiUrl()}/api/system-settings`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ settings: settingsToSave }),
        }
      );

      if (response.ok) {
        setSuccess(t('lit.settingsSavedSuccessfully'));
        showToast({ type: 'success', title: t('lit.settingsSaved'), message: t('lit.settingsSavedSuccessfully') });
        clearPasswordInput(smtpPasswordRef);
        clearPasswordInput(outlookClientSecretRef);
        clearPasswordInput(openAIApiKeyRef);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await response.json();
        throw new Error(data.message || t('lit.failedToSaveSettings'));
      }
    } catch (err: any) {
      setError(err.message || t('lit.failedToSaveSettings'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof SystemSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!onActionsStateChange) return;
    if (isLoading) {
      onActionsStateChange(null);
      return;
    }
    onActionsStateChange({
      saving: isSaving,
      canSave: activeTab !== 'maintenance',
      onSave: () => {
        formRef.current?.requestSubmit();
      },
      showSyncAiViews: activeTab === 'ai',
      syncingAiViews: isSyncingAiViews,
      onSyncAiViews: () => {
        void handleSyncAiViews();
      },
    });
    return () => onActionsStateChange(null);
  }, [onActionsStateChange, isLoading, isSaving, activeTab, isSyncingAiViews]);

  const handleBrandingUpload = async (kind: 'logo' | 'favicon', file: File | null) => {
    if (!token || !file) return;
    setIsUploadingBranding(kind);
    setError('');
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const response = await fetch(`${getApiUrl()}/api/system-settings/branding-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          fileData,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || t('lit.uploadFailed'));
      }
      const field = kind === 'logo' ? 'companyLogoUrl' : 'faviconUrl';
      handleChange(field, data.url || '');
      showToast({ type: 'success', message: data.message || t('lit.uploaded') });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('lit.uploadFailed');
      setError(message);
      showToast({ type: 'error', message });
    } finally {
      setIsUploadingBranding(null);
      if (kind === 'logo' && logoFileInputRef.current) logoFileInputRef.current.value = '';
      if (kind === 'favicon' && faviconFileInputRef.current) faviconFileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--pm-muted)]">
        {t('lit.loadingSettings')}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <p className="text-xs text-[var(--pm-muted)]">
        {t('lit.configureBrandingEmailAccessFeaturesAiAndMaintenanceUtilities')}
      </p>

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

      <PageTabs
        tabs={SETTINGS_TABS}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as SettingsTab)}
      />

      <form ref={formRef} id="system-settings-form" onSubmit={handleSubmit} className="space-y-3">

        
        {activeTab === 'branding' && (
          <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.branding')}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.companyName')}
                </label>
                <input
                  type="text"
                  value={settings.companyName || ''}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  placeholder={t('lit.myelin')}
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.companyLogoUrl')}
                </label>
                <input
                  type="text"
                  inputMode="url"
                  value={settings.companyLogoUrl || ''}
                  onChange={(e) => handleChange('companyLogoUrl', e.target.value)}
                  placeholder='https://example.com/logo.png or /uploads/branding/…'
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => handleBrandingUpload('logo', e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => logoFileInputRef.current?.click()}
                    disabled={isUploadingBranding === 'logo'}
                    className="h-8 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-xs font-medium text-[var(--pm-text)] hover:bg-[var(--pm-surface-2)] disabled:opacity-50"
                  >
                    {isUploadingBranding === 'logo' ? t('lit.uploading') : t('lit.uploadLogo')}
                  </button>
                  {settings.companyLogoUrl ? (
                     
                    <img src={settings.companyLogoUrl} alt={t('lit.logoPreview')} className="h-8 max-w-[120px] object-contain rounded border border-gray-200 dark:border-gray-600 bg-white" />
                  ) : null}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.faviconUrl')}
                </label>
                <input
                  type="text"
                  inputMode="url"
                  value={settings.faviconUrl || ''}
                  onChange={(e) => handleChange('faviconUrl', e.target.value)}
                  placeholder='https://example.com/favicon.ico or /uploads/branding/…'
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    ref={faviconFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                    className="hidden"
                    onChange={(e) => handleBrandingUpload('favicon', e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => faviconFileInputRef.current?.click()}
                    disabled={isUploadingBranding === 'favicon'}
                    className="h-8 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-xs font-medium text-[var(--pm-text)] hover:bg-[var(--pm-surface-2)] disabled:opacity-50"
                  >
                    {isUploadingBranding === 'favicon' ? t('lit.uploading') : t('lit.uploadFavicon')}
                  </button>
                  {settings.faviconUrl ? (
                     
                    <img src={settings.faviconUrl} alt={t('lit.faviconPreview')} className="h-8 w-8 object-contain rounded border border-gray-200 dark:border-gray-600 bg-white" />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        
        {activeTab === 'email' && (
          <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.smtpConfiguration')}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.smtpHost')}
                </label>
                <input
                  type="text"
                  value={settings.smtpHost}
                  onChange={(e) => handleChange('smtpHost', e.target.value)}
                  placeholder={t('lit.smtpExampleCom')}
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.smtpPort')}
                </label>
                <input
                  type="number"
                  value={settings.smtpPort}
                  onChange={(e) => handleChange('smtpPort', e.target.value)}
                  placeholder="587"
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.smtpUser')}
                </label>
                <input
                  type="text"
                  value={settings.smtpUser}
                  onChange={(e) => handleChange('smtpUser', e.target.value)}
                  placeholder={t('lit.userExampleCom')}
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.smtpPassword')}
                </label>
                <PasswordInput
                  ref={smtpPasswordRef}
                  name="smtpPassword"
                  placeholder=""
                  autoComplete="new-password"
                  preventAutofill
                />
                <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                  {t('lit.leaveBlankToKeepTheExistingPasswordOnlyFillInToChangeIt')}
                </p>
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.fromEmail')}
                </label>
                <input
                  type="email"
                  value={settings.smtpFrom}
                  onChange={(e) => handleChange('smtpFrom', e.target.value)}
                  placeholder={t('lit.noreplyExampleCom')}
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.fromName')}
                </label>
                <input
                  type="text"
                  value={settings.smtpFromName}
                  onChange={(e) => handleChange('smtpFromName', e.target.value)}
                  placeholder={t('lit.myelin')}
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  {t('lit.useTlsSsl')}
                </label>
                <select
                  value={settings.smtpSecure}
                  onChange={(e) => handleChange('smtpSecure', e.target.value)}
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                >
                  <option value="true">{t('lit.yesTlsSsl')}</option>
                  <option value="false">{t('lit.noPlain')}</option>
                </select>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-200 dark:border-gray-600 pt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.outlookCalendarIntegration')}</h3>

              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.outlookCalendarEnabled === 'true'}
                    onChange={(e) => handleChange('outlookCalendarEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">{t('lit.enableOutlookCalendarSync')}</div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      Adds Outlook events to the in-app calendar. Managers/admins can include team members in the same organization.
                    </div>
                  </div>
                </label>

                {settings.outlookCalendarEnabled === 'true' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-0 md:ml-8">
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        {t('lit.azureTenantId')}
                      </label>
                      <input
                        type="text"
                        value={settings.outlookTenantId || ''}
                        onChange={(e) => handleChange('outlookTenantId', e.target.value)}
                        placeholder={t('lit.xxxxxxxxXxxxXxxxXxxxXxxxxxxxxxxx')}
                        className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      />
                    </div>

                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        {t('lit.azureClientId')}
                      </label>
                      <input
                        type="text"
                        value={settings.outlookClientId || ''}
                        onChange={(e) => handleChange('outlookClientId', e.target.value)}
                        placeholder={t('lit.xxxxxxxxXxxxXxxxXxxxXxxxxxxxxxxx')}
                        className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        {t('lit.azureClientSecret')}
                      </label>
                      <PasswordInput
                        ref={outlookClientSecretRef}
                        name="outlookClientSecret"
                        placeholder=""
                        autoComplete="new-password"
                        preventAutofill
                      />
                      <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                        {t('lit.leaveEmptyAndSaveToClearTheStoredOutlookClientSecret')}
                      </p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={settings.outlookIncludeTeamEventsForManagers !== 'false'}
                          onChange={(e) => handleChange('outlookIncludeTeamEventsForManagers', e.target.checked ? 'true' : 'false')}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                        />
                        <div>
                          <div className="text-sm font-medium text-[var(--pm-text)]">{t('lit.managersAdminsSeeTeamOutlookEvents')}</div>
                          <div className="text-[11px] text-[var(--pm-muted)]">
                            {t('lit.usesUsersInTheSameOrganizationWithValidEmailAddresses')}
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        
        {activeTab === 'access' && (
          <div className="space-y-3">
            <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.registrationSettings')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={settings.allowPublicRegistration === 'true'}
                      onChange={(e) => handleChange('allowPublicRegistration', e.target.checked ? 'true' : 'false')}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                    />
                    <div>
                      <div className="text-sm font-medium text-[var(--pm-text)]">
                        {t('lit.allowPublicRegistration')}
                      </div>
                      <div className="text-[11px] text-[var(--pm-muted)]">
                        {t('lit.allowUsersToRegisterFromTheFrontpageWithoutAnInvitation')}
                      </div>
                    </div>
                  </label>
                </div>

                {settings.allowPublicRegistration === 'true' && (
                  <div className="ml-8 mt-4 space-y-4">
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        {t('lit.registrationType')}
                      </label>
                      <select
                        value={settings.publicRegistrationType}
                        onChange={(e) => handleChange('publicRegistrationType', e.target.value)}
                        required={settings.allowPublicRegistration === 'true'}
                        className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      >
                        <option value="internal">{t('lit.internalUser')}</option>
                        <option value="customer">{t('lit.customerUser')}</option>
                      </select>
                      <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                        {settings.publicRegistrationType === 'internal'
                          ? t('lit.newUsersWillBeCreatedAsInternalUsers')
                          : 'New users will be created as customer users (linked to a specific customer)'}
                      </p>
                    </div>

                    {settings.publicRegistrationType === 'customer' && (
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                          {t('lit.defaultCustomer')}
                        </label>
                        <select
                          value={settings.defaultCustomerId}
                          onChange={(e) => handleChange('defaultCustomerId', e.target.value)}
                          required={settings.publicRegistrationType === 'customer'}
                          className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        >
                          <option value="">{t('lit.selectACustomer')}</option>
                          {customers.map((customer) => (
                            <option key={customer.Id} value={customer.Id}>
                              {customer.Name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                          {t('lit.newUsersWillBeLinkedToThisCustomer')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.timezoneSettings')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                    {t('lit.defaultSystemTimezone')}
                  </label>
                  <select
                    value={settings.defaultTimezone}
                    onChange={(e) => handleChange('defaultTimezone', e.target.value)}
                    className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                    This timezone will be used as the default for all users who have not set their own timezone preference.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        
        {activeTab === 'features' && (
          <div className="space-y-3">
            <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.featureToggles')}</h3>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.frontpageEnabled !== 'false'}
                    onChange={(e) => handleChange('frontpageEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      {t('lit.enableFrontPage')}
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      {t('lit.whenDisabledVisitingTheRootUrlRedirectsDirectlyToTheLoginPage')}
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.internalTicketsEnabled === 'true'}
                    onChange={(e) => handleChange('internalTicketsEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      {t('lit.enableInternalTicketSystem')}
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      {t('lit.showsHidesInternalTicketsModuleGloballyDoesNotDisableTicketIntegrationUsedInTask')}
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.memosEnabled === 'true'}
                    onChange={(e) => handleChange('memosEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      {t('lit.enableMemosMenu')}
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      {t('lit.onlyControlsVisibilityOfMemosInTheNavbar')}
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.expensesEnabled === 'true'}
                    onChange={(e) => handleChange('expensesEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      {t('lit.enableExpensesModule')}
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      {t('lit.showsHidesTheProjectExpensesModuleGloballyWhenDisabledExpenseApisReturn403')}
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveExpenses === 'true'}
                    onChange={(e) => handleChange('autoApproveExpenses', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      {t('lit.autoApproveExpenses')}
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      {t('lit.whenEnabledNewExpensesAreCreatedAsApprovedInsteadOfPending')}
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveTimeEntries === 'true'}
                    onChange={(e) => handleChange('autoApproveTimeEntries', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      {t('lit.autoApproveTimeEntries')}
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      {t('lit.newTimeEntriesAreCreatedAsApprovedAndApprovedEntriesRemainEditable')}
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveVacations === 'true'}
                    onChange={(e) => handleChange('autoApproveVacations', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      {t('lit.autoApproveVacations')}
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      {t('lit.newVacationRequestsAreImmediatelyApproved')}
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveOutOfOffice === 'true'}
                    onChange={(e) => handleChange('autoApproveOutOfOffice', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      {t('lit.autoApproveOutOfOffice')}
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      {t('lit.newOutOfOfficeRequestsAreImmediatelyApproved')}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-3">
            <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">{t('lit.aiAssistant')}</h3>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.aiAssistantEnabled === 'true'}
                    onChange={(e) => handleChange('aiAssistantEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      {t('lit.enableAiAssistant')}
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      {t('lit.showsHidesAiFeaturesGloballyConfigureOpenaiOrOllamaBelow')}
                    </div>
                  </div>
                </label>

                <div>
                  <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                    {t('lit.aiProvider')}
                  </label>
                  <select
                    value={settings.aiProvider === 'ollama' ? 'ollama' : 'openai'}
                    onChange={(e) => handleChange('aiProvider', e.target.value)}
                    className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                  >
                    <option value="openai">{t('lit.openai')}</option>
                    <option value="ollama">{t('lit.ollamaLocalSelfHosted')}</option>
                  </select>
                  <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                    {t('lit.usedByTheAssistantWidgetTaskTranslateSummarizeAndPatchNotesImprovement')}
                  </p>
                </div>

                {settings.aiProvider === 'ollama' ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        {t('lit.ollamaBaseUrl')}
                      </label>
                      <input
                        type="text"
                        value={settings.ollamaBaseUrl || 'http://127.0.0.1:11434'}
                        onChange={(e) => handleChange('ollamaBaseUrl', e.target.value)}
                        placeholder='http://127.0.0.1:11434'
                        className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      />
                      <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                        {t('lit.fromDockerOnLinuxTry')} <code className="font-mono">http://172.17.0.1:11434</code> {t('lit.orHostNetworking')}
                      </p>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        {t('lit.ollamaModel')}
                      </label>
                      <input
                        type="text"
                        value={settings.ollamaModel || 'llama3.2'}
                        onChange={(e) => handleChange('ollamaModel', e.target.value)}
                        placeholder={t('lit.llama32')}
                        className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      />
                      <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                        {t('lit.mustAlreadyBePulledOllamaPullLlama32')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                    {t('lit.openaiApiKey')}
                  </label>
                  <PasswordInput
                    ref={openAIApiKeyRef}
                    name="openAIApiKey"
                    placeholder={t('lit.sk')}
                    autoComplete="new-password"
                    preventAutofill
                    className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                  />
                  <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                    {t('lit.leaveBlankToKeepTheExistingKeyOnlyFillInToChangeIt')}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                      {t('lit.openaiModel')}
                    </label>
                    <select
                      value={settings.openAIModel || 'gpt-4o-mini'}
                      onChange={(e) => handleChange('openAIModel', e.target.value)}
                      className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                    >
                      <option value="gpt-4o-mini">{t('lit.gpt4oMiniDefault')}</option>
                      <option value="gpt-4.1-mini">{t('lit.gpt41Mini')}</option>
                      <option value="gpt-4.1">{t('lit.gpt41')}</option>
                      <option value="o4-mini">{t('lit.o4Mini')}</option>
                    </select>
                    <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                      {t('lit.selectTheModelUsedByTheAiAssistantBackend')}
                    </p>
                  </div>
                  </div>
                  </>
                )}

                <div>
                    <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                      {t('lit.assistantBehavior')}
                    </label>
                    <textarea
                      value={settings.openAIBehavior || ''}
                      onChange={(e) => handleChange('openAIBehavior', e.target.value)}
                      rows={3}
                      placeholder={t('lit.exampleBeConciseUseBulletPointsAndIncludeActionableNextSteps')}
                      className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                      {t('lit.optionalCustomInstructionAppendedToAssistantSystemBehavior')}
                    </p>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('lit.aiDataViews')}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    The AI assistant reads data exclusively from these database views. You can customise the SELECT body for each view below (leave empty to use the built-in default).
                  </p>

                  <label className="flex items-center gap-3 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={settings.aiViewsAutoCreate === 'true'}
                      onChange={(e) => handleChange('aiViewsAutoCreate', e.target.checked ? 'true' : 'false')}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                    />
                    <div>
                      <div className="text-sm font-medium text-[var(--pm-text)]">
                        {t('lit.autoCreateSyncAiViewsOnServerStartup')}
                      </div>
                      <div className="text-[11px] text-[var(--pm-muted)]">
                        {t('lit.whenEnabledStartupEnsuresAiViewsExistAndAppliesTheSqlDefinitionsBelow')}
                      </div>
                    </div>
                  </label>

                  <div className="grid grid-cols-1 gap-3">
                    {(
                      [
                        { key: 'aiViewSql_vAI_ProjectOpenTasks', label: t('lit.vaiProjectopentasks') },
                        { key: 'aiViewSql_vAI_UserOpenTasks',    label: t('lit.vaiUseropentasks') },
                        { key: 'aiViewSql_vAI_UserWorkloadBase', label: t('lit.vaiUserworkloadbase') },
                        { key: 'aiViewSql_vAI_UserAllocations',  label: t('lit.vaiUserallocations') },
                      ] as { key: keyof SystemSettings; label: string }[]
                    ).map(({ key, label }) => (
                      <div key={key}>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                          {t('lit.sqlFor')} <code className="rounded bg-[var(--pm-panel)] px-1 font-mono text-[11px]">{label}</code>
                        </label>
                        <textarea
                          value={(settings[key] as string) || ''}
                          onChange={(e) => handleChange(key, e.target.value)}
                          rows={5}
                          placeholder={t('lit.leaveEmptyToUseTheBuiltInDefaultSelect')}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 font-mono text-xs text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        />
                      </div>
                    ))}
                  </div>

                  {(aiViewsSyncMessage || aiViewsSyncError) && (
                    <div className="mt-2 space-y-1">
                      {aiViewsSyncMessage && (
                        <p className="text-sm text-green-600 dark:text-green-400">{aiViewsSyncMessage}</p>
                      )}
                      {aiViewsSyncError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{aiViewsSyncError}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <div>
              <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
                {t('lit.maintenance')}
              </h3>
              <p className="text-[11px] text-[var(--pm-muted)]">
                {t('lit.administrativeUtilitiesForDataConsistencyAndMigrations')}
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-[var(--pm-text)]">{t('lit.createSystemPermissionGroups')}</h4>
                <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                  Creates the default Developer, Support, and Manager permission groups for any organization that is missing them.
                  Safe to run multiple times — existing groups are not modified.
                </p>
                {migrationResult && (
                  <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                    Done: {migrationResult.created} groups created, {migrationResult.skipped} already existed.
                  </p>
                )}
                {migrationError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{migrationError}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleMigrateSystemGroups}
                disabled={isMigrating}
                className="h-10 shrink-0 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:bg-amber-400"
              >
                {isMigrating ? 'Running…' : t('lit.runMigration')}
              </button>
            </div>
          </div>
        )}

        {/* Save — embedded fallback when parent does not own PageStickyActions */}
        {actionsPlacement === 'embedded' && activeTab !== 'maintenance' && (
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-[var(--pm-border)] bg-[var(--pm-panel)] px-4 py-3 sm:-mx-6 sm:px-6">
            {activeTab === 'ai' && (
              <button
                type="button"
                onClick={() => void handleSyncAiViews()}
                disabled={isSyncingAiViews || isSaving}
                className="h-10 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-surface)] px-4 text-sm font-medium text-[var(--pm-text)] transition-colors hover:bg-[var(--pm-surface-2)] disabled:opacity-50"
              >
                {isSyncingAiViews ? 'Syncing…' : t('lit.syncAiViewsNow')}
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="h-10 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
            >
              {isSaving ? t('lit.saving2') : t('lit.saveSettings')}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

