'use client';

import { t } from '@/lib/i18n/runtime';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';

/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';

import { getApiUrl } from '@/lib/api/config';
import { recurringAllocationsApi, RecurringAllocation } from '@/lib/api/recurringAllocations';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import ProfileTaskFormVisibility from '@/components/profile/ProfileTaskFormVisibility';
import ApiTokensManagement from '@/components/admin/ApiTokensManagement';
import PageTabs from '@/components/PageTabs';
import PageStickyChrome from '@/components/PageStickyChrome';
import PageStickyActions, { pageActionButtonClass } from '@/components/PageStickyActions';
import type { TaskFormVisibilityActionsState } from '@/components/admin/TaskFormVisibilitySettingsPanel';
import { useUrlTab } from '@/hooks/useUrlTab';

const PROFILE_TABS = [
  'info',
  'attachments',
  'workHours',
  'security',
  'apiTokens',
  'emailAlerts',
  'recurringTasks',
  'vacations',
  'outOfOffice',
  'taskForm',
] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];
const TIMEZONES = [
  { value: '', label: t('lit.useSystemDefault') },
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

type LeaveDayPortion = 'full' | 'half';

const normalizeLeaveDayPortion = (value: unknown): LeaveDayPortion => {
  return String(value || '').toLowerCase() === 'half' ? 'half' : 'full';
};

const formatLeaveUnits = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

export default function ProfilePage() {
  const { t } = useI18n();

  return (
    <Suspense
      fallback={
        <div className="w-full flex items-center justify-center">
          <div className="text-gray-700 dark:text-gray-200">{t('pages.profile.loading')}</div>
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}

function ProfilePageContent() {
  const { t, locale, setLocale } = useI18n();
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const { user, token, isLoading: authLoading, isCustomerUser, updateUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useUrlTab<ProfileTab>(PROFILE_TABS, 'info');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [taskFormActions, setTaskFormActions] = useState<TaskFormVisibilityActionsState | null>(null);
  
  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    timezone: '',
    countryCode: '',
    regionCode: '',
    navbarMenuLayout: 'top',
    navbarLeftMode: 'fixed',
    navbarLeftCollapsed: false,
    dashboardCalendarInOverview: true,
    hoursDisplayFormat: 'hms',
    azureAdObjectId: '',
  });
  const [profileRegions, setProfileRegions] = useState<{ code: string; name: string }[]>([]);
  
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [canChangePassword, setCanChangePassword] = useState(false);

  const syncPasswordFormState = () => {
    const currentPassword = readPasswordInput(currentPasswordRef);
    const newPassword = readPasswordInput(newPasswordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);
    setCanChangePassword(
      currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0
    );
  };
  
  // Work Hours state
  const [workHours, setWorkHours] = useState({
    monday: 8,
    tuesday: 8,
    wednesday: 8,
    thursday: 8,
    friday: 8,
    saturday: 0,
    sunday: 0,
  });
  const [workStartTimes, setWorkStartTimes] = useState({
    monday: '09:00',
    tuesday: '09:00',
    wednesday: '09:00',
    thursday: '09:00',
    friday: '09:00',
    saturday: '09:00',
    sunday: '09:00',
  });
  const [lunchTime, setLunchTime] = useState('12:00');
  const [lunchDuration, setLunchDuration] = useState(60);
  const [hobbyStartTimes, setHobbyStartTimes] = useState({
    monday: '19:00',
    tuesday: '19:00',
    wednesday: '19:00',
    thursday: '19:00',
    friday: '19:00',
    saturday: '10:00',
    sunday: '10:00',
  });
  const [hobbyHours, setHobbyHours] = useState({
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 4,
    sunday: 4,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Email preferences state
  const [emailPreferences, setEmailPreferences] = useState<any[]>([]);
  const [isSavingEmailPrefs, setIsSavingEmailPrefs] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState<string | null>(null);

  const [vacationEntries, setVacationEntries] = useState<any[]>([]);
  const [vacationSummary, setVacationSummary] = useState({
    annualTotal: 22,
    approvedDays: 0,
    pendingDays: 0,
    reservedDays: 0,
    remainingDays: 22,
    isOverLimit: false,
  });
  const [vacationStartDate, setVacationStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [vacationEndDate, setVacationEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [vacationDayPortion, setVacationDayPortion] = useState<LeaveDayPortion>('full');
  const [vacationNotes, setVacationNotes] = useState('');
  const [isSavingVacation, setIsSavingVacation] = useState(false);
  const [vacationDeleteTarget, setVacationDeleteTarget] = useState<{ id: number; date: string } | null>(null);
  const [recurringDeleteId, setRecurringDeleteId] = useState<number | null>(null);

  const [outOfOfficeEntries, setOutOfOfficeEntries] = useState<any[]>([]);
  const [outOfOfficeSummary, setOutOfOfficeSummary] = useState({
    approvedDays: 0,
    pendingDays: 0,
    rejectedDays: 0,
    reservedDays: 0,
  });
  const [outOfOfficeStartDate, setOutOfOfficeStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [outOfOfficeEndDate, setOutOfOfficeEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [outOfOfficeDayPortion, setOutOfOfficeDayPortion] = useState<LeaveDayPortion>('full');
  const [outOfOfficeNotes, setOutOfOfficeNotes] = useState('');
  const [isSavingOutOfOffice, setIsSavingOutOfOffice] = useState(false);
  const [outOfOfficeDeleteTarget, setOutOfOfficeDeleteTarget] = useState<{ id: number; date: string } | null>(null);

  // Recurring Tasks state
  const [recurringAllocations, setRecurringAllocations] = useState<RecurringAllocation[]>([]);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringAllocation | null>(null);
  const [recurringError, setRecurringError] = useState('');
  const [recurringForm, setRecurringForm] = useState({
    title: '',
    description: '',
    recurrenceType: 'daily',
    recurrenceInterval: 1,
    daysOfWeek: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    startTime: '09:00',
    endTime: '17:00',
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (user && token) {
      loadUserProfile();
    }
  }, [user, authLoading, router, token]);

  useEffect(() => {
    loadProfileRegions(profileForm.countryCode);
  }, [profileForm.countryCode, token]);

  useEffect(() => {
    if (!isCustomerUser) return;
    const customerHidden: ProfileTab[] = [
      'vacations',
      'outOfOffice',
      'workHours',
      'recurringTasks',
      'taskForm',
      'apiTokens',
    ];
    if (customerHidden.includes(activeTab)) {
      setActiveTab('info');
    }
  }, [isCustomerUser, activeTab, setActiveTab]);

  const loadUserProfile = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/profile`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const profile = data.user;
        
        setWorkHours({
          monday: profile.WorkHoursMonday || 8,
          tuesday: profile.WorkHoursTuesday || 8,
          wednesday: profile.WorkHoursWednesday || 8,
          thursday: profile.WorkHoursThursday || 8,
          friday: profile.WorkHoursFriday || 8,
          saturday: profile.WorkHoursSaturday || 0,
          sunday: profile.WorkHoursSunday || 0,
        });
        setWorkStartTimes({
          monday: profile.WorkStartMonday || '09:00',
          tuesday: profile.WorkStartTuesday || '09:00',
          wednesday: profile.WorkStartWednesday || '09:00',
          thursday: profile.WorkStartThursday || '09:00',
          friday: profile.WorkStartFriday || '09:00',
          saturday: profile.WorkStartSaturday || '09:00',
          sunday: profile.WorkStartSunday || '09:00',
        });
        setLunchTime(profile.LunchTime || '12:00');
        setLunchDuration(profile.LunchDuration || 60);
        setHobbyStartTimes({
          monday: profile.HobbyStartMonday || '19:00',
          tuesday: profile.HobbyStartTuesday || '19:00',
          wednesday: profile.HobbyStartWednesday || '19:00',
          thursday: profile.HobbyStartThursday || '19:00',
          friday: profile.HobbyStartFriday || '19:00',
          saturday: profile.HobbyStartSaturday || '10:00',
          sunday: profile.HobbyStartSunday || '10:00',
        });
        setHobbyHours({
          monday: profile.HobbyHoursMonday || 0,
          tuesday: profile.HobbyHoursTuesday || 0,
          wednesday: profile.HobbyHoursWednesday || 0,
          thursday: profile.HobbyHoursThursday || 0,
          friday: profile.HobbyHoursFriday || 0,
          saturday: profile.HobbyHoursSaturday || 4,
          sunday: profile.HobbyHoursSunday || 4,
        });
        
        // Set profile form
        setProfileForm({
          firstName: profile.FirstName || '',
          lastName: profile.LastName || '',
          email: profile.Email || '',
          timezone: profile.Timezone || '',
          countryCode: profile.CountryCode || '',
          regionCode: profile.RegionCode || '',
          navbarMenuLayout: (profile.NavbarMenuLayout || 'top') === 'left' ? 'left' : 'top',
          navbarLeftMode: (profile.NavbarLeftMode || 'fixed') === 'floating' ? 'floating' : 'fixed',
          navbarLeftCollapsed: !!profile.NavbarLeftCollapsed,
          dashboardCalendarInOverview: Number(profile.DashboardCalendarInOverview ?? 1) === 1,
          hoursDisplayFormat: (profile.HoursDisplayFormat || 'hms') === 'decimal' ? 'decimal' : 'hms',
          azureAdObjectId: profile.AzureAdObjectId || '',
        });
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  };

  const loadAttachments = async () => {
    if (!token || !user) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/${user.id}/attachments`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAttachments(data.attachments || []);
      }
    } catch (err: any) {
      console.error('Failed to load attachments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEmailPreferences = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/email-preferences`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setEmailPreferences(data.preferences || []);
      }
    } catch (err: any) {
      console.error('Failed to load email preferences:', err);
    }
  };

  const loadVacationData = async () => {
    if (!token) return;
    try {
      const year = new Date().getFullYear();
      const response = await fetch(`${getApiUrl()}/api/vacations/my?year=${year}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(t('lit.failedToLoadVacations'));
      }

      const data = await response.json();
      setVacationEntries(data.entries || []);
      setVacationSummary({
        annualTotal: Number(data.annualTotal || 22),
        approvedDays: Number(data.approvedDays || 0),
        pendingDays: Number(data.pendingDays || 0),
        reservedDays: Number(data.reservedDays || 0),
        remainingDays: Number(data.remainingDays || 0),
        isOverLimit: !!data.isOverLimit,
      });
    } catch (err: any) {
      setMessage(err.message || t('lit.failedToLoadVacations'));
    }
  };

  const getVacationRequestDays = () => {
    const start = new Date(`${vacationStartDate}T12:00:00`);
    const end = new Date(`${vacationEndDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  };

  const getVacationRequestUnits = () => {
    const days = getVacationRequestDays();
    const multiplier = vacationDayPortion === 'half' ? 0.5 : 1;
    return days * multiplier;
  };

  const handleRequestVacation = async () => {
    if (!token) return;
    const requestDays = getVacationRequestDays();

    if (requestDays <= 0) {
      setMessage(t('lit.invalidVacationDateRange'));
      return;
    }

    setIsSavingVacation(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/vacations/my/request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: vacationStartDate,
          endDate: vacationEndDate,
          dayPortion: vacationDayPortion,
          notes: vacationNotes,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToSubmitVacationRequest'));
      }

      const exceededDates = Array.isArray(data.exceededDates) ? data.exceededDates : [];
      const nonWorkingDates = Array.isArray(data.nonWorkingDates) ? data.nonWorkingDates : [];
      const exceededSuffix = exceededDates.length > 0
        ? ` · Exceeded days: ${exceededDates.join(', ')}`
        : '';
      const nonWorkingSuffix = nonWorkingDates.length > 0
        ? ` · Non-working days skipped: ${nonWorkingDates.join(', ')}`
        : '';

      setMessage(`Vacation request submitted (${data.created || 0} added${data.skipped ? `, ${data.skipped} duplicate` : ''}${data.exceeded ? `, ${data.exceeded} exceeded` : ''}${data.nonWorkingSkipped ? `, ${data.nonWorkingSkipped} non-working` : ''})${exceededSuffix}${nonWorkingSuffix}`);
      setVacationNotes('');
      setVacationDayPortion('full');
      await loadVacationData();
    } catch (err: any) {
      setMessage(err.message || t('lit.failedToSubmitVacationRequest'));
    } finally {
      setIsSavingVacation(false);
    }
  };

  const handleDeleteMyVacation = async (vacationId: number) => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/vacations/${vacationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToDeleteVacationDay'));
      }

      setMessage(t('lit.vacationDayDeleted'));
      await loadVacationData();
    } catch (err: any) {
      setMessage(err.message || t('lit.failedToDeleteVacationDay'));
    }
  };

  const confirmDeleteMyVacation = async () => {
    if (!vacationDeleteTarget) return;
    const vacationId = vacationDeleteTarget.id;
    setVacationDeleteTarget(null);
    await handleDeleteMyVacation(vacationId);
  };

  const loadOutOfOfficeData = async () => {
    if (!token) return;
    try {
      const year = new Date().getFullYear();
      const response = await fetch(`${getApiUrl()}/api/out-of-office/my?year=${year}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(t('lit.failedToLoadOutOfOffice'));
      }

      const data = await response.json();
      const normalizedEntries = (data.entries || []).map((entry: any) => ({
        ...entry,
        VacationDate: entry.VacationDate || entry.OutOfOfficeDate,
      }));

      setOutOfOfficeEntries(normalizedEntries);
      setOutOfOfficeSummary({
        approvedDays: Number(data.approvedDays || 0),
        pendingDays: Number(data.pendingDays || 0),
        rejectedDays: Number(data.rejectedDays || 0),
        reservedDays: Number(data.reservedDays || 0),
      });
    } catch (err: any) {
      setMessage(err.message || t('lit.failedToLoadOutOfOffice'));
    }
  };

  const getOutOfOfficeRequestDays = () => {
    const start = new Date(`${outOfOfficeStartDate}T12:00:00`);
    const end = new Date(`${outOfOfficeEndDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  };

  const getOutOfOfficeRequestUnits = () => {
    const days = getOutOfOfficeRequestDays();
    const multiplier = outOfOfficeDayPortion === 'half' ? 0.5 : 1;
    return days * multiplier;
  };

  const handleRequestOutOfOffice = async () => {
    if (!token) return;
    const requestDays = getOutOfOfficeRequestDays();

    if (requestDays <= 0) {
      setMessage(t('lit.invalidOutOfOfficeDateRange'));
      return;
    }

    setIsSavingOutOfOffice(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/out-of-office/my/request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: outOfOfficeStartDate,
          endDate: outOfOfficeEndDate,
          dayPortion: outOfOfficeDayPortion,
          notes: outOfOfficeNotes,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToSubmitOutOfOfficeRequest'));
      }

      const nonWorkingDates = Array.isArray(data.nonWorkingDates) ? data.nonWorkingDates : [];
      const nonWorkingSuffix = nonWorkingDates.length > 0
        ? ` · Non-working days skipped: ${nonWorkingDates.join(', ')}`
        : '';

      setMessage(`Out-of-office request submitted (${data.created || 0} added${data.skipped ? `, ${data.skipped} duplicate` : ''}${data.nonWorkingSkipped ? `, ${data.nonWorkingSkipped} non-working` : ''})${nonWorkingSuffix}`);
      setOutOfOfficeNotes('');
      setOutOfOfficeDayPortion('full');
      await loadOutOfOfficeData();
    } catch (err: any) {
      setMessage(err.message || t('lit.failedToSubmitOutOfOfficeRequest'));
    } finally {
      setIsSavingOutOfOffice(false);
    }
  };

  const handleDeleteMyOutOfOffice = async (outOfOfficeId: number) => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/out-of-office/${outOfOfficeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || t('lit.failedToDeleteOutOfOfficeDay'));
      }

      setMessage(t('lit.outOfOfficeDayDeleted'));
      await loadOutOfOfficeData();
    } catch (err: any) {
      setMessage(err.message || t('lit.failedToDeleteOutOfOfficeDay'));
    }
  };

  const confirmDeleteMyOutOfOffice = async () => {
    if (!outOfOfficeDeleteTarget) return;
    const outOfOfficeId = outOfOfficeDeleteTarget.id;
    setOutOfOfficeDeleteTarget(null);
    await handleDeleteMyOutOfOffice(outOfOfficeId);
  };

  const saveEmailPreferences = async () => {
    if (!token) return;
    
    setIsSavingEmailPrefs(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/email-preferences`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ preferences: emailPreferences }),
        }
      );
      
      if (response.ok) {
        setMessage(t('lit.emailPreferencesSavedSuccessfully'));
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(t('lit.failedToSaveEmailPreferences'));
      }
    } catch (_err: any) {
      setMessage(t('lit.failedToSaveEmailPreferences'));
    } finally {
      setIsSavingEmailPrefs(false);
    }
  };

  const toggleEmailPreference = (type: string) => {
    setEmailPreferences(prefs =>
      prefs.map(pref =>
        pref.type === type
          ? { ...pref, emailEnabled: !pref.emailEnabled }
          : pref
      )
    );
  };

  const sendTestSummaryEmail = async (type: 'daily' | 'weekly') => {
    if (!token) return;
    
    const summaryType = type === 'daily' ? 'daily_work_summary' : 'weekly_work_summary';
    setSendingTestEmail(summaryType);
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/email-preferences/test-summary/${type}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || t('lit.testEmailSentSuccessfully'));
      } else {
        setMessage(data.message || t('lit.failedToSendTestEmail'));
      }
      setTimeout(() => setMessage(''), 5000);
    } catch (_err: any) {
      setMessage(t('lit.failedToSendTestEmail'));
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setSendingTestEmail(null);
    }
  };

  // Recurring Allocations Functions
  const loadRecurringAllocations = async () => {
    if (!token || !user) return;
    
    try {
      const allocations = await recurringAllocationsApi.getUserAllocations(user.id, token);
      setRecurringAllocations(allocations);
    } catch (err: any) {
      console.error('Failed to load recurring allocations:', err);
      setMessage(t('lit.failedToLoadRecurringTasks'));
    }
  };

  const handleSaveRecurring = async () => {
    if (!token || !user) return;
    
    setRecurringError('');
    
    // Validate required fields
    if (!recurringForm.title.trim()) {
      setRecurringError(t('lit.titleIsRequired'));
      return;
    }
    if (!recurringForm.recurrenceType) {
      setRecurringError(t('lit.recurrenceTypeIsRequired'));
      return;
    }
    if (!recurringForm.startDate) {
      setRecurringError(t('lit.startDateIsRequired2'));
      return;
    }
    if (!recurringForm.startTime) {
      setRecurringError(t('lit.startTimeIsRequired'));
      return;
    }
    if (!recurringForm.endTime) {
      setRecurringError(t('lit.endTimeIsRequired'));
      return;
    }
    
    // Validate custom_days requires daysOfWeek
    if (recurringForm.recurrenceType === 'custom_days' && !recurringForm.daysOfWeek) {
      setRecurringError(t('lit.pleaseSelectAtLeastOneDayOfTheWeek'));
      return;
    }
    
    // Validate interval types require interval value
    if (['interval_days', 'interval_weeks', 'interval_months'].includes(recurringForm.recurrenceType)) {
      if (!recurringForm.recurrenceInterval || recurringForm.recurrenceInterval < 1) {
        setRecurringError('Interval must be at least 1');
        return;
      }
    }
    
    setIsSaving(true);
    
    try {
      const allocationData: Partial<RecurringAllocation> = {
        UserId: user.id,
        Title: recurringForm.title.trim(),
        Description: recurringForm.description.trim() || undefined,
        RecurrenceType: recurringForm.recurrenceType,
        RecurrenceInterval: recurringForm.recurrenceInterval || undefined,
        DaysOfWeek: recurringForm.daysOfWeek || undefined,
        StartDate: recurringForm.startDate,
        EndDate: recurringForm.endDate || undefined,
        StartTime: recurringForm.startTime,
        EndTime: recurringForm.endTime,
      };

      console.log('Saving recurring allocation:', allocationData);

      if (editingRecurring) {
        await recurringAllocationsApi.update(editingRecurring.Id, allocationData, token);
        setMessage(t('lit.recurringTaskUpdatedSuccessfully'));
      } else {
        await recurringAllocationsApi.create(allocationData, token);
        setMessage(t('lit.recurringTaskCreatedSuccessfully'));
      }
      
      await loadRecurringAllocations();
      setShowRecurringModal(false);
      setEditingRecurring(null);
      setRecurringError('');
      resetRecurringForm();
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      console.error('Error saving recurring task:', err);
      setRecurringError(err.message || t('lit.failedToSaveRecurringTask'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecurring = (id: number) => {
    if (!token) return;
    setRecurringDeleteId(id);
  };

  const confirmDeleteRecurring = async () => {
    if (!token || recurringDeleteId === null) return;
    const id = recurringDeleteId;
    setRecurringDeleteId(null);
    try {
      await recurringAllocationsApi.delete(id, token);
      setMessage(t('lit.recurringTaskDeletedSuccessfully'));
      await loadRecurringAllocations();
      setTimeout(() => setMessage(''), 3000);
    } catch (_err: any) {
      setMessage(t('lit.failedToDeleteRecurringTask'));
    }
  };

  const handleEditRecurring = (allocation: RecurringAllocation) => {
    setEditingRecurring(allocation);
    setRecurringForm({
      title: allocation.Title,
      description: allocation.Description || '',
      recurrenceType: allocation.RecurrenceType,
      recurrenceInterval: allocation.RecurrenceInterval || 1,
      daysOfWeek: allocation.DaysOfWeek || '',
      startDate: allocation.StartDate,
      endDate: allocation.EndDate || '',
      startTime: allocation.StartTime,
      endTime: allocation.EndTime,
    });
    setShowRecurringModal(true);
  };

  const resetRecurringForm = () => {
    setRecurringForm({
      title: '',
      description: '',
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      daysOfWeek: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      startTime: '09:00',
      endTime: '17:00',
    });
  };

  const getRecurrenceTypeLabel = (type: string, interval?: number, daysOfWeek?: string) => {
    switch (type) {
      case 'daily':
        return t('lit.everyDay');
      case 'weekly':
        return t('lit.everyWeek');
      case 'monthly':
        return t('lit.everyMonth');
      case 'custom_days':
        if (daysOfWeek) {
          const days = daysOfWeek.split(',').map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseInt(d)]);
          return `Every ${days.join(', ')}`;
        }
        return t('lit.customDays');
      case 'interval_days':
        return `Every ${interval} day(s)`;
      case 'interval_weeks':
        return `Every ${interval} week(s)`;
      case 'interval_months':
        return `Every ${interval} month(s)`;
      default:
        return type;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    return '📎';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Task': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Ticket': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Project': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'Customer': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'Organization': return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const handleDownloadAttachment = async (attachment: any) => {
    if (!token) return;
    
    try {
      let endpoint = '';
      switch (attachment.Type) {
        case 'Task':
          endpoint = `/api/task-attachments/${attachment.Id}`;
          break;
        case 'Ticket':
          endpoint = `/api/ticket-attachments/${attachment.Id}`;
          break;
        case 'Project':
          endpoint = `/api/project-attachments/${attachment.Id}`;
          break;
        case 'Customer':
          endpoint = `/api/customer-attachments/${attachment.Id}`;
          break;
        case 'Organization':
          endpoint = `/api/organization-attachments/${attachment.Id}`;
          break;
        default:
          return;
      }

      const response = await fetch(
        `${getApiUrl()}${endpoint}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const fileData = data.data;
        
        // Convert base64 to blob
        const byteCharacters = atob(fileData.FileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: fileData.FileType });
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileData.FileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to download attachment:', err);
    }
  };

  const updateWorkHour = (day: keyof typeof workHours, value: number) => {
    setWorkHours(prev => ({ ...prev, [day]: value }));
  };

  const updateWorkStartTime = (day: keyof typeof workStartTimes, value: string) => {
    setWorkStartTimes(prev => ({ ...prev, [day]: value }));
  };

  const updateHobbyHour = (day: keyof typeof hobbyHours, value: number) => {
    setHobbyHours(prev => ({ ...prev, [day]: value }));
  };

  const updateHobbyStartTime = (day: keyof typeof hobbyStartTimes, value: string) => {
    setHobbyStartTimes(prev => ({ ...prev, [day]: value }));
  };

  const getTotalWeeklyHours = () => {
    return Object.values(workHours).reduce((sum, hours) => sum + (Number(hours) || 0), 0);
  };

  const getTotalWeeklyHobbyHours = () => {
    return Object.values(hobbyHours).reduce((sum, hours) => sum + (Number(hours) || 0), 0);
  };

  const handleSaveWorkHours = async () => {
    if (!token) return;
    
    setIsSaving(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/work-hours`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workHours,
            workStartTimes,
            lunchTime,
            lunchDuration,
            hobbyHours,
            hobbyStartTimes,
          }),
        }
      );
      
      if (response.ok) {
        setMessage(t('lit.workHoursSettingsSavedSuccessfully'));
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await response.json();
        setMessage(data.message || t('lit.failedToSaveWorkHours'));
      }
    } catch (err: any) {
      setMessage(err.message || t('lit.anErrorOccurred'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!token) return;
    
    setIsSaving(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/profile`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(profileForm),
        }
      );
      
      if (response.ok) {
        setMessage(t('lit.profileUpdatedSuccessfully'));
        setIsEditingProfile(false);
        updateUser({ hoursDisplayFormat: profileForm.hoursDisplayFormat });
        // Reload to get updated data
        await loadUserProfile();
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await response.json();
        setMessage(data.message || t('lit.failedToUpdateProfile'));
      }
    } catch (err: any) {
      setMessage(err.message || t('lit.anErrorOccurred'));
    } finally {
      setIsSaving(false);
    }
  };

  const loadProfileRegions = async (cc: string) => {
    if (!token || !cc) { setProfileRegions([]); return; }
    try {
      const res = await fetch(`${getApiUrl()}/api/holidays/regions/${cc}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfileRegions(data.regions || []);
      } else {
        setProfileRegions([]);
      }
    } catch {
      setProfileRegions([]);
    }
  };

  const handleChangePassword = async () => {
    if (!token) return;
    
    const currentPassword = readPasswordInput(currentPasswordRef);
    const newPassword = readPasswordInput(newPasswordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);

    if (newPassword !== confirmPassword) {
      setMessage(t('lit.newPasswordsDoNotMatch'));
      return;
    }
    
    if (newPassword.length < 6) {
      setMessage(t('lit.passwordMustBeAtLeast6Characters'));
      return;
    }
    
    setIsSaving(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/change-password`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        }
      );
      
      if (response.ok) {
        setMessage(t('lit.passwordChangedSuccessfully'));
        clearPasswordInput(currentPasswordRef);
        clearPasswordInput(newPasswordRef);
        clearPasswordInput(confirmPasswordRef);
        setCanChangePassword(false);
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await response.json();
        setMessage(data.message || t('lit.failedToChangePassword'));
      }
    } catch (err: any) {
      setMessage(err.message || t('lit.anErrorOccurred'));
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <PageLoadingSkeleton />
    );
  }

  const profileTabs = [
    { id: 'info', label: t('lit.profileInfo') },
    ...(!isCustomerUser
      ? [
          { id: 'vacations', label: t('lit.vacations') },
          { id: 'outOfOffice', label: t('lit.outOfOffice') },
          { id: 'workHours', label: t('lit.workHours') },
          { id: 'recurringTasks', label: t('lit.recurringTasks') },
        ]
      : []),
    { id: 'attachments', label: `${t('lit.myAttachments')} (${attachments.length})` },
    { id: 'security', label: t('lit.security') },
    ...(!isCustomerUser ? [{ id: 'apiTokens', label: t('pages.profile.apiTokens') }] : []),
    { id: 'emailAlerts', label: t('pages.profile.emailPreferences') },
    ...(!isCustomerUser ? [{ id: 'taskForm', label: t('pages.profile.taskFormVisibility') }] : []),
  ];

  const handleProfileTabChange = (id: string) => {
    const next = id as ProfileTab;
    setActiveTab(next);
    if (next === 'vacations') loadVacationData();
    if (next === 'outOfOffice') loadOutOfOfficeData();
    if (next === 'emailAlerts') loadEmailPreferences();
    if (next === 'attachments') loadAttachments();
    if (next === 'recurringTasks') loadRecurringAllocations();
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <PageStickyChrome>
        <div>
          <h1 className="text-xl font-semibold text-[var(--pm-text)]">
            {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username}
          </h1>
          <p className="text-sm text-[var(--pm-muted)]">{user.email}</p>
        </div>

        <PageTabs tabs={profileTabs} activeId={activeTab} onChange={handleProfileTabChange} />
      </PageStickyChrome>

      <main ref={scrollContainerRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-3">
        <div className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] p-4 shadow-sm">
              {message && (
                <div className={`mb-3 rounded px-3 py-2 text-sm ${
                  message.includes('successfully') || message.includes(t('lit.success'))
                    ? 'bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400'
                }`}>
                  {message}
                </div>
              )}
              
              {activeTab === 'info' && (
                <div className="space-y-3">
                  <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
                      {t('pages.profile.preferences')}
                    </p>
                    <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                      {t('chrome.language')}
                    </label>
                    <select
                      className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      value={locale}
                      onChange={(e) => setLocale(e.target.value as Locale)}
                      aria-label={t('chrome.language')}
                    >
                      {LOCALES.map((l) => (
                        <option key={l} value={l}>
                          {LOCALE_LABELS[l]}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-[var(--pm-muted)]">{t('pages.profile.languageHint')}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('auth.username')}</label>
                      <p className="rounded border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)]">
                        {user.username}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">{t('lit.cannotBeChanged')}</p>
                    </div>

                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.firstName2')}</label>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={profileForm.firstName}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, firstName: e.target.value }))}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        />
                      ) : (
                        <p className="px-0.5 py-1.5 text-sm text-[var(--pm-text)]">{user.firstName || t('lit.notSet')}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.lastName2')}</label>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={profileForm.lastName}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, lastName: e.target.value }))}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        />
                      ) : (
                        <p className="px-0.5 py-1.5 text-sm text-[var(--pm-text)]">{user.lastName || t('lit.notSet')}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('auth.email')}</label>
                      {isEditingProfile ? (
                        <input
                          type="email"
                          value={profileForm.email}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        />
                      ) : (
                        <p className="truncate px-0.5 py-1.5 text-sm text-[var(--pm-text)]" title={user.email}>{user.email}</p>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.azureAdObjectId')}</label>
                      {isEditingProfile ? (
                        <>
                          <input
                            type="text"
                            value={profileForm.azureAdObjectId}
                            onChange={(e) => setProfileForm(prev => ({ ...prev, azureAdObjectId: e.target.value }))}
                            placeholder="00000000-0000-0000-0000-000000000000"
                            className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 font-mono text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                          />
                          <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                            Needed for Teams call import. Find &quot;oid&quot; at{' '}
                            <a href="https://myaccount.microsoft.com" target="_blank" rel="noopener noreferrer" className="text-[var(--pm-accent-soft)] underline">
                              {t('lit.myaccountMicrosoftCom')}
                            </a>
                            {' '}→ Profile → Show JSON.
                          </p>
                        </>
                      ) : (
                        <p className="truncate px-0.5 py-1.5 font-mono text-sm text-[var(--pm-text)]">
                          {profileForm.azureAdObjectId || <span className="italic text-[var(--pm-muted)]">{t('lit.notSet')}</span>}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.timezone')}</label>
                      {isEditingProfile ? (
                        <select
                          value={profileForm.timezone}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, timezone: e.target.value }))}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        >
                          {TIMEZONES.map(tz => (
                            <option key={tz.value} value={tz.value}>{tz.label}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="px-0.5 py-1.5 text-sm text-[var(--pm-text)]">
                          {profileForm.timezone ? TIMEZONES.find(tz => tz.value === profileForm.timezone)?.label || profileForm.timezone : t('lit.systemDefault')}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.country')}</label>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={profileForm.countryCode}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().slice(0, 2);
                            setProfileForm(prev => ({ ...prev, countryCode: val, regionCode: '' }));
                          }}
                          placeholder={t('lit.eGPtDeUs')}
                          maxLength={2}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        />
                      ) : (
                        <p className="px-0.5 py-1.5 text-sm text-[var(--pm-text)]">{profileForm.countryCode || '—'}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.regionSubdivision')}</label>
                      {isEditingProfile ? (
                        profileRegions.length > 0 ? (
                          <select
                            value={profileForm.regionCode}
                            onChange={(e) => setProfileForm(prev => ({ ...prev, regionCode: e.target.value }))}
                            className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                          >
                            <option value="">— National (no region) —</option>
                            {profileRegions.map((r) => (
                              <option key={r.code} value={r.code}>{r.name}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="px-0.5 py-1.5 text-sm italic text-[var(--pm-muted)]">
                            {profileForm.countryCode
                              ? t('lit.noRegionalHolidaysForThisCountry')
                              : t('lit.setACountryFirst')}
                          </p>
                        )
                      ) : (
                        <p className="px-0.5 py-1.5 text-sm text-[var(--pm-text)]">{profileForm.regionCode || '—'}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.hoursDisplayFormat')}</label>
                      {isEditingProfile ? (
                        <select
                          value={profileForm.hoursDisplayFormat}
                          onChange={(e) => setProfileForm(prev => ({
                            ...prev,
                            hoursDisplayFormat: e.target.value === 'decimal' ? 'decimal' : 'hms',
                          }))}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        >
                          <option value="hms">{t('lit.hhMmSsEG013000')}</option>
                          <option value="decimal">{t('lit.decimalEG150h')}</option>
                        </select>
                      ) : (
                        <p className="px-0.5 py-1.5 text-sm text-[var(--pm-text)]">
                          {profileForm.hoursDisplayFormat === 'decimal' ? 'Decimal (e.g. 1.50h)' : 'hh:MM:ss (e.g. 01:30:00)'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--pm-text)]">{t('lit.showCalendarInDashboardOverview')}</p>
                      <p className="text-[11px] text-[var(--pm-muted)]">
                        {t('lit.whenEnabledCalendarAppearsInOverviewAndTheSeparateCalendarMenuIsHidden')}
                      </p>
                    </div>
                    {isEditingProfile ? (
                      <input
                        type="checkbox"
                        checked={profileForm.dashboardCalendarInOverview}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, dashboardCalendarInOverview: e.target.checked }))}
                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                      />
                    ) : (
                      <span className="shrink-0 text-sm text-[var(--pm-muted)]">
                        {profileForm.dashboardCalendarInOverview ? t('common.yes') : t('common.no')}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="max-w-md space-y-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    {t('pages.profile.changePassword')}
                  </h2>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('auth.currentPassword')}
                    </label>
                    <PasswordInput
                      ref={currentPasswordRef}
                      name="currentPassword"
                      onInput={syncPasswordFormState}
                      autoComplete="current-password"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('auth.newPassword')}
                    </label>
                    <PasswordInput
                      ref={newPasswordRef}
                      name="newPassword"
                      onInput={syncPasswordFormState}
                      autoComplete="new-password"
                      preventAutofill
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('lit.mustBeAtLeast6Characters')}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('auth.confirmPassword')}
                    </label>
                    <PasswordInput
                      ref={confirmPasswordRef}
                      name="confirmPassword"
                      onInput={syncPasswordFormState}
                      autoComplete="new-password"
                      preventAutofill
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'apiTokens' && !isCustomerUser && <ApiTokensManagement mode="self" />}

              {activeTab === 'workHours' && (
                <div className="space-y-3">
                    <p className="text-sm text-[var(--pm-muted)]">
                      {t('lit.configureYourWorkAndHobbyScheduleForEachDayOfTheWeek')}
                    </p>

                    <div className="overflow-x-auto" data-grid-enhancer-ignore="true">
                      <table className="w-full table-fixed border-collapse">
                        <colgroup>
                          <col className="w-[22%]" />
                          <col className="w-[19.5%]" />
                          <col className="w-[19.5%]" />
                          <col className="w-[19.5%]" />
                          <col className="w-[19.5%]" />
                        </colgroup>
                        <thead>
                          <tr className="bg-[var(--pm-surface)]">
                            <th className="border border-[var(--pm-border)] px-3 py-2 text-left text-xs font-semibold text-[var(--pm-muted)]">
                              {t('lit.dayOfWeek2')}
                            </th>
                            <th className="border border-[var(--pm-border)] px-3 py-2 text-center text-xs font-semibold text-blue-700 dark:text-blue-300" colSpan={2}>
                              {t('nav.sectionWork')}
                            </th>
                            <th className="border border-[var(--pm-border)] px-3 py-2 text-center text-xs font-semibold text-purple-700 dark:text-purple-300" colSpan={2}>
                              {t('lit.hobby')}
                            </th>
                          </tr>
                          <tr className="bg-[var(--pm-surface)]">
                            <th className="border border-[var(--pm-border)] px-3 py-1.5"></th>
                            <th className="border border-[var(--pm-border)] px-3 py-1.5 text-xs font-medium text-[var(--pm-muted)]">
                              {t('lit.startTime')}
                            </th>
                            <th className="border border-[var(--pm-border)] px-3 py-1.5 text-xs font-medium text-[var(--pm-muted)]">
                              {t('common.hours')}
                            </th>
                            <th className="border border-[var(--pm-border)] px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400">
                              {t('lit.startTime')}
                            </th>
                            <th className="border border-[var(--pm-border)] px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400">
                              {t('common.hours')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { key: 'monday', label: t('lit.monday') },
                            { key: 'tuesday', label: t('lit.tuesday') },
                            { key: 'wednesday', label: t('lit.wednesday') },
                            { key: 'thursday', label: t('lit.thursday') },
                            { key: 'friday', label: t('lit.friday') },
                            { key: 'saturday', label: t('lit.saturday') },
                            { key: 'sunday', label: t('lit.sunday') },
                          ].map(({ key, label }) => (
                            <tr key={key} className="hover:bg-[var(--pm-surface)]">
                              <td className="border border-[var(--pm-border)] px-3 py-2">
                                <span className="text-sm font-medium text-[var(--pm-text)]">{label}</span>
                              </td>
                              <td className="border border-[var(--pm-border)] px-2 py-1.5">
                                <input
                                  type="time"
                                  value={workStartTimes[key as keyof typeof workStartTimes]}
                                  onChange={(e) => updateWorkStartTime(key as keyof typeof workStartTimes, e.target.value)}
                                  className="box-border w-full min-w-0 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-2 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                                />
                              </td>
                              <td className="border border-[var(--pm-border)] px-2 py-1.5">
                                <div className="flex w-full min-w-0 items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="24"
                                    step="0.5"
                                    value={workHours[key as keyof typeof workHours]}
                                    onChange={(e) => updateWorkHour(key as keyof typeof workHours, parseFloat(e.target.value) || 0)}
                                    className="box-border min-w-0 w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-2 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                                  />
                                  <span className="shrink-0 text-xs text-[var(--pm-muted)]">h</span>
                                </div>
                              </td>
                              <td className="border border-[var(--pm-border)] bg-purple-50/40 px-2 py-1.5 dark:bg-purple-900/10">
                                <input
                                  type="time"
                                  value={hobbyStartTimes[key as keyof typeof hobbyStartTimes]}
                                  onChange={(e) => updateHobbyStartTime(key as keyof typeof hobbyStartTimes, e.target.value)}
                                  className="box-border w-full min-w-0 rounded-md border border-purple-300 bg-[var(--pm-panel)] px-2 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-purple-500 dark:border-purple-600"
                                />
                              </td>
                              <td className="border border-[var(--pm-border)] bg-purple-50/40 px-2 py-1.5 dark:bg-purple-900/10">
                                <div className="flex w-full min-w-0 items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="24"
                                    step="0.5"
                                    value={hobbyHours[key as keyof typeof hobbyHours]}
                                    onChange={(e) => updateHobbyHour(key as keyof typeof hobbyHours, parseFloat(e.target.value) || 0)}
                                    className="box-border min-w-0 w-full rounded-md border border-purple-300 bg-[var(--pm-panel)] px-2 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-purple-500 dark:border-purple-600"
                                  />
                                  <span className="shrink-0 text-xs text-purple-500 dark:text-purple-400">h</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-[var(--pm-surface)]">
                            <td className="border border-[var(--pm-border)] px-3 py-2 text-right text-sm font-semibold text-[var(--pm-text)]">
                              {t('lit.weeklyTotals')}
                            </td>
                            <td className="border border-[var(--pm-border)] px-2 py-2"></td>
                            <td className="border border-[var(--pm-border)] px-2 py-2">
                              <span className="text-sm font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                                {getTotalWeeklyHours().toFixed(1)}h
                              </span>
                            </td>
                            <td className="border border-[var(--pm-border)] bg-purple-50/40 px-2 py-2 dark:bg-purple-900/10"></td>
                            <td className="border border-[var(--pm-border)] bg-purple-50/40 px-2 py-2 dark:bg-purple-900/10">
                              <span className="text-sm font-semibold tabular-nums text-purple-600 dark:text-purple-400">
                                {getTotalWeeklyHobbyHours().toFixed(1)}h
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
                      <h3 className="mb-3 text-sm font-semibold text-[var(--pm-text)]">{t('lit.lunchBreakSettings')}</h3>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                            {t('lit.lunchTime')}
                          </label>
                          <input
                            type="time"
                            value={lunchTime}
                            onChange={(e) => setLunchTime(e.target.value)}
                            className="box-border w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                          />
                          <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                            {t('lit.whenYourLunchBreakTypicallyStarts')}
                          </p>
                        </div>
                        <div>
                          <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                            {t('lit.lunchDuration')}
                          </label>
                          <div className="flex w-full items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="180"
                              step="15"
                              value={lunchDuration}
                              onChange={(e) => setLunchDuration(parseInt(e.target.value) || 0)}
                              className="box-border min-w-0 w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                            />
                            <span className="shrink-0 text-sm text-[var(--pm-muted)]">{t('lit.minutes')}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                            {t('lit.howLongYourLunchBreakUsuallyLasts')}
                          </p>
                        </div>
                      </div>
                    </div>
                </div>
              )}

              {activeTab === 'attachments' && (
                <div>
                  {isLoading ? (
                    <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
                  ) : attachments.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                      {t('lit.youHaventUploadedAnyFilesYet')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {attachments.map((attachment: any) => (
                        <div
                          key={`${attachment.Type}-${attachment.Id}`}
                          className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                        >
                          <div className="flex items-start gap-4">
                            <span className="text-3xl flex-shrink-0">{getFileIcon(attachment.FileType)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getTypeColor(attachment.Type)}`}>
                                  {attachment.Type}
                                </span>
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                  {attachment.EntityName}
                                </span>
                                {attachment.ProjectName && (
                                  <span className="text-sm text-gray-500 dark:text-gray-500">
                                    · {attachment.ProjectName}
                                  </span>
                                )}
                              </div>
                              <div className="font-medium text-gray-900 dark:text-white truncate">
                                {attachment.FileName}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {formatFileSize(attachment.FileSize)} · {new Date(attachment.CreatedAt).toLocaleDateString()}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDownloadAttachment(attachment)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors flex-shrink-0"
                              title={t('common.download')}
                            >
                              ⬇️ {t('common.download')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'taskForm' && token && !isCustomerUser && (
                <ProfileTaskFormVisibility token={token} onActionsStateChange={setTaskFormActions} />
              )}

              {activeTab === 'emailAlerts' && (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--pm-muted)]">
                    {t('lit.chooseWhichNotificationsYouWantToReceiveViaEmail')}
                  </p>

                  {['Tasks', 'Projects', 'Tickets', 'Planning', 'Summaries'].map(category => {
                    const categoryPrefs = emailPreferences.filter(pref => pref.category === category);
                    if (categoryPrefs.length === 0) return null;

                    return (
                      <div key={category} className="space-y-1.5">
                        <h3 className="border-b border-[var(--pm-border)] pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
                          {category}
                        </h3>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {categoryPrefs.map(pref => (
                            <div
                              key={pref.type}
                              className="flex items-start gap-2 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-2.5 py-2"
                            >
                              <input
                                type="checkbox"
                                id={`email-pref-${pref.type}`}
                                checked={pref.emailEnabled}
                                onChange={() => toggleEmailPreference(pref.type)}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                              />
                              <label htmlFor={`email-pref-${pref.type}`} className="min-w-0 flex-1 cursor-pointer">
                                <span className="block text-sm font-medium text-[var(--pm-text)]">{pref.label}</span>
                                {pref.description && (
                                  <span className="mt-0.5 block text-[11px] text-[var(--pm-muted)]">{pref.description}</span>
                                )}
                              </label>
                              {(pref.type === 'daily_work_summary' || pref.type === 'weekly_work_summary') && (
                                <button
                                  type="button"
                                  onClick={() => sendTestSummaryEmail(pref.type === 'daily_work_summary' ? 'daily' : 'weekly')}
                                  disabled={sendingTestEmail !== null}
                                  className="shrink-0 rounded border border-[var(--pm-border)] px-2 py-0.5 text-[11px] text-[var(--pm-text)] hover:bg-[var(--pm-surface-2)] disabled:opacity-50"
                                >
                                  {sendingTestEmail === pref.type ? 'Sending…' : t('lit.sendTest')}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {emailPreferences.length === 0 && (
                    <div className="py-6 text-center text-sm text-[var(--pm-muted)]">
                      {t('lit.loadingPreferences')}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'recurringTasks' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('lit.recurringTasks')}</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {t('lit.defineRecurringTimeBlocksThatAreAutomaticallyAllocatedToPreventSchedulingConflic')}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingRecurring(null);
                        resetRecurringForm();
                        setShowRecurringModal(true);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      <span>➕</span> {t('lit.newRecurringTask')}
                    </button>
                  </div>

                  {recurringAllocations.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <p className="text-lg mb-2">{t('lit.noRecurringTasksDefined')}</p>
                      <p className="text-sm">{t('lit.createARecurringTaskToAutomaticallyBlockTimeOnYourCalendar')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recurringAllocations.map(allocation => (
                        <div
                          key={allocation.Id}
                          className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900 dark:text-white">{allocation.Title}</h3>
                              {!allocation.IsActive && (
                                <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                                  {t('common.inactive')}
                                </span>
                              )}
                            </div>
                            {allocation.Description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{allocation.Description}</p>
                            )}
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                🔄 {getRecurrenceTypeLabel(allocation.RecurrenceType, allocation.RecurrenceInterval, allocation.DaysOfWeek)}
                              </span>
                              <span className="flex items-center gap-1">
                                ⏰ {allocation.StartTime} - {allocation.EndTime}
                              </span>
                              <span className="flex items-center gap-1">
                                📅 {new Date(allocation.StartDate).toLocaleDateString()}
                                {allocation.EndDate && ` - ${new Date(allocation.EndDate).toLocaleDateString()}`}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => handleEditRecurring(allocation)}
                              className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteRecurring(allocation.Id)}
                              className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'vacations' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                      <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.annualTotal')}</p>
                      <p className="text-base font-semibold tabular-nums text-[var(--pm-text)]">{vacationSummary.annualTotal}</p>
                    </div>
                    <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                      <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.approved')}</p>
                      <p className="text-base font-semibold tabular-nums text-green-600 dark:text-green-400">{vacationSummary.approvedDays}</p>
                    </div>
                    <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                      <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.pending')}</p>
                      <p className="text-base font-semibold tabular-nums text-yellow-600 dark:text-yellow-400">{vacationSummary.pendingDays}</p>
                    </div>
                    <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                      <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.remaining')}</p>
                      <p className="text-base font-semibold tabular-nums text-blue-600 dark:text-blue-400">{vacationSummary.remainingDays}</p>
                    </div>
                  </div>

                  {vacationSummary.isOverLimit && (
                    <div className="rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {t('lit.warningVacationAllocationExceedsAnnualLimit')}
                    </div>
                  )}

                  <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
                    <h3 className="text-sm font-semibold text-[var(--pm-text)]">{t('lit.requestVacation')}</h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('common.startDate')}</label>
                        <input
                          type="date"
                          value={vacationStartDate}
                          onChange={(e) => setVacationStartDate(e.target.value)}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)]"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('common.endDate')}</label>
                        <input
                          type="date"
                          value={vacationEndDate}
                          onChange={(e) => setVacationEndDate(e.target.value)}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.dayPortion')}</label>
                        <select
                          value={vacationDayPortion}
                          onChange={(e) => setVacationDayPortion(e.target.value as LeaveDayPortion)}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)]"
                        >
                          <option value="full">{t('lit.fullDayDefault')}</option>
                          <option value="half">{t('lit.halfDay')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.notes')}</label>
                        <input
                          type="text"
                          value={vacationNotes}
                          onChange={(e) => setVacationNotes(e.target.value)}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)]"
                          placeholder={t('lit.optionalNotes')}
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleRequestVacation}
                      disabled={isSavingVacation}
                      className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {isSavingVacation ? 'Submitting…' : `Request ${formatLeaveUnits(getVacationRequestUnits())} day(s)`}
                    </button>
                  </div>

                  <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
                    <h3 className="mb-2 text-sm font-semibold text-[var(--pm-text)]">{t('lit.myVacationDays')}</h3>
                    {vacationEntries.length === 0 ? (
                      <p className="text-sm text-[var(--pm-muted)]">{t('lit.noVacationRecordsYet')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {vacationEntries.map((entry) => (
                          <div key={entry.Id} className="flex items-center justify-between rounded bg-[var(--pm-panel)] px-2 py-1.5">
                            <span className="text-sm text-[var(--pm-text)]">{String(entry.VacationDate).split('T')[0]}</span>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-800 dark:bg-gray-600 dark:text-gray-100">
                                {normalizeLeaveDayPortion(entry.DayPortion) === 'half' ? t('lit.halfDay') : t('lit.fullDay')}
                              </span>
                              <span className={`rounded px-2 py-0.5 text-xs ${String(entry.Status).toLowerCase() === 'approved'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : String(entry.Status).toLowerCase() === 'rejected'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                {entry.Status}
                              </span>
                              <button
                                onClick={() => setVacationDeleteTarget({ id: entry.Id, date: String(entry.VacationDate).split('T')[0] })}
                                className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700"
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'outOfOffice' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                      <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.approved')}</p>
                      <p className="text-base font-semibold tabular-nums text-green-600 dark:text-green-400">{outOfOfficeSummary.approvedDays}</p>
                    </div>
                    <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                      <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.pending')}</p>
                      <p className="text-base font-semibold tabular-nums text-yellow-600 dark:text-yellow-400">{outOfOfficeSummary.pendingDays}</p>
                    </div>
                    <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                      <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.rejected')}</p>
                      <p className="text-base font-semibold tabular-nums text-red-600 dark:text-red-400">{outOfOfficeSummary.rejectedDays}</p>
                    </div>
                    <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2">
                      <p className="text-[11px] text-[var(--pm-muted)]">{t('lit.reserved')}</p>
                      <p className="text-base font-semibold tabular-nums text-blue-600 dark:text-blue-400">{outOfOfficeSummary.reservedDays}</p>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
                    <h3 className="text-sm font-semibold text-[var(--pm-text)]">{t('lit.requestOutOfOffice')}</h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('common.startDate')}</label>
                        <input
                          type="date"
                          value={outOfOfficeStartDate}
                          onChange={(e) => setOutOfOfficeStartDate(e.target.value)}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)]"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('common.endDate')}</label>
                        <input
                          type="date"
                          value={outOfOfficeEndDate}
                          onChange={(e) => setOutOfOfficeEndDate(e.target.value)}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.dayPortion')}</label>
                        <select
                          value={outOfOfficeDayPortion}
                          onChange={(e) => setOutOfOfficeDayPortion(e.target.value as LeaveDayPortion)}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)]"
                        >
                          <option value="full">{t('lit.fullDayDefault')}</option>
                          <option value="half">{t('lit.halfDay')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">{t('lit.notes')}</label>
                        <input
                          type="text"
                          value={outOfOfficeNotes}
                          onChange={(e) => setOutOfOfficeNotes(e.target.value)}
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)]"
                          placeholder={t('lit.optionalNotes')}
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleRequestOutOfOffice}
                      disabled={isSavingOutOfOffice}
                      className="h-9 rounded-lg bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-700 disabled:bg-gray-400"
                    >
                      {isSavingOutOfOffice ? 'Submitting…' : `Request ${formatLeaveUnits(getOutOfOfficeRequestUnits())} day(s)`}
                    </button>
                  </div>

                  <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
                    <h3 className="mb-2 text-sm font-semibold text-[var(--pm-text)]">{t('lit.myOutOfOfficeDays')}</h3>
                    {outOfOfficeEntries.length === 0 ? (
                      <p className="text-sm text-[var(--pm-muted)]">{t('lit.noOutOfOfficeRecordsYet')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {outOfOfficeEntries.map((entry) => (
                          <div key={entry.Id} className="flex items-center justify-between rounded bg-[var(--pm-panel)] px-2 py-1.5">
                            <span className="text-sm text-[var(--pm-text)]">{String(entry.OutOfOfficeDate || entry.VacationDate).split('T')[0]}</span>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-800 dark:bg-gray-600 dark:text-gray-100">
                                {normalizeLeaveDayPortion(entry.DayPortion) === 'half' ? t('lit.halfDay') : t('lit.fullDay')}
                              </span>
                              <span className={`rounded px-2 py-0.5 text-xs ${String(entry.Status).toLowerCase() === 'approved'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : String(entry.Status).toLowerCase() === 'rejected'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                {entry.Status}
                              </span>
                              <button
                                onClick={() => setOutOfOfficeDeleteTarget({ id: entry.Id, date: String(entry.OutOfOfficeDate || entry.VacationDate).split('T')[0] })}
                                className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700"
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recurring Task Modal */}
              {showRecurringModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                        {editingRecurring ? t('lit.editRecurringTask') : t('lit.newRecurringTask')}
                      </h2>

                      {recurringError && (
                        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                          {recurringError}
                        </div>
                      )}

                      <div className="space-y-4">
                        {/* Title */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('lit.title2')}
                          </label>
                          <input
                            type="text"
                            value={recurringForm.title}
                            onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder={t('lit.eGTeamMeetingGymTime')}
                          />
                        </div>

                        {/* Description */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('common.description')}
                          </label>
                          <textarea
                            value={recurringForm.description}
                            onChange={(e) => setRecurringForm({ ...recurringForm, description: e.target.value })}
                            rows={2}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder={t('lit.optionalDescription')}
                          />
                        </div>

                        {/* Recurrence Type */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('lit.recurrencePattern')}
                          </label>
                          <select
                            value={recurringForm.recurrenceType}
                            onChange={(e) => setRecurringForm({ ...recurringForm, recurrenceType: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="daily">{t('lit.everyDay')}</option>
                            <option value="weekly">{t('lit.everyWeek')}</option>
                            <option value="monthly">{t('lit.everyMonth')}</option>
                            <option value="custom_days">{t('lit.specificDaysOfTheWeek')}</option>
                            <option value="interval_days">{t('lit.everyXDays')}</option>
                            <option value="interval_weeks">{t('lit.everyXWeeks')}</option>
                            <option value="interval_months">{t('lit.everyXMonths')}</option>
                          </select>
                        </div>

                        {/* Interval (for interval_days/weeks/months) */}
                        {['interval_days', 'interval_weeks', 'interval_months'].includes(recurringForm.recurrenceType) && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('lit.interval')}
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={recurringForm.recurrenceInterval}
                              onChange={(e) => setRecurringForm({ ...recurringForm, recurrenceInterval: parseInt(e.target.value) || 1 })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                        )}

                        {/* Days of Week (for custom_days) */}
                        {recurringForm.recurrenceType === 'custom_days' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              {t('lit.selectDays')}
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {[t('lit.sunday'), 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => {
                                const selectedDays = recurringForm.daysOfWeek.split(',').filter(d => d);
                                const isSelected = selectedDays.includes(String(index));
                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    onClick={() => {
                                      let days = recurringForm.daysOfWeek.split(',').filter(d => d);
                                      if (isSelected) {
                                        days = days.filter(d => d !== String(index));
                                      } else {
                                        days.push(String(index));
                                      }
                                      setRecurringForm({ ...recurringForm, daysOfWeek: days.join(',') });
                                    }}
                                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                                      isSelected
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                    }`}
                                  >
                                    {day.substring(0, 3)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Time Range */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('lit.startTime2')}
                            </label>
                            <input
                              type="time"
                              value={recurringForm.startTime}
                              onChange={(e) => setRecurringForm({ ...recurringForm, startTime: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('lit.endTime2')}
                            </label>
                            <input
                              type="time"
                              value={recurringForm.endTime}
                              onChange={(e) => setRecurringForm({ ...recurringForm, endTime: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                        </div>

                        {/* Date Range */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('lit.startDate2')}
                            </label>
                            <input
                              type="date"
                              value={recurringForm.startDate}
                              onChange={(e) => setRecurringForm({ ...recurringForm, startDate: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('lit.endDateOptional')}
                            </label>
                            <input
                              type="date"
                              value={recurringForm.endDate}
                              onChange={(e) => setRecurringForm({ ...recurringForm, endDate: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('lit.thisRecurringTaskWillAutomaticallyBlockTimeOnYourCalendarToPreventSchedulingConf')}
                        </p>
                      </div>

                      <div className="flex gap-3 mt-6">
                        <button
                          onClick={() => {
                            setShowRecurringModal(false);
                            setEditingRecurring(null);
                            setRecurringError('');
                            resetRecurringForm();
                          }}
                          className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={handleSaveRecurring}
                          disabled={isSaving || !recurringForm.title.trim() || !recurringForm.startTime || !recurringForm.endTime || !recurringForm.startDate}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                        >
                          {isSaving ? t('lit.saving') : t('lit.saveRecurringTask')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {vacationDeleteTarget && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t('lit.deleteVacationDay')}</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                        Are you sure you want to delete your vacation day on{' '}
                        <span className="font-medium">{vacationDeleteTarget.date}</span>?
                      </p>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setVacationDeleteTarget(null)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={confirmDeleteMyVacation}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {outOfOfficeDeleteTarget && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t('lit.deleteOutOfOfficeDay')}</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                        Are you sure you want to delete your out-of-office day on{' '}
                        <span className="font-medium">{outOfOfficeDeleteTarget.date}</span>?
                      </p>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setOutOfOfficeDeleteTarget(null)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={confirmDeleteMyOutOfOffice}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

        </div>
      </main>

      {(activeTab === 'info' ||
        activeTab === 'workHours' ||
        activeTab === 'security' ||
        activeTab === 'emailAlerts' ||
        activeTab === 'taskForm') && (
        <PageStickyActions>
          {activeTab === 'info' && (
            <>
              {!isEditingProfile ? (
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className={pageActionButtonClass.primary}
                >
                  {t('lit.editProfile')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingProfile(false);
                      loadUserProfile();
                    }}
                    className={pageActionButtonClass.secondary}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className={pageActionButtonClass.success}
                  >
                    {isSaving ? t('common.saving') : t('pages.profile.saveProfile')}
                  </button>
                </>
              )}
            </>
          )}
          {activeTab === 'workHours' && (
            <button
              type="button"
              onClick={handleSaveWorkHours}
              disabled={isSaving}
              className={pageActionButtonClass.primary}
            >
              {isSaving ? t('common.saving') : t('lit.saveSettings')}
            </button>
          )}
          {activeTab === 'security' && (
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={isSaving || !canChangePassword}
              className={pageActionButtonClass.primary}
            >
              {isSaving ? t('lit.changingPassword') : t('pages.profile.changePassword')}
            </button>
          )}
          {activeTab === 'emailAlerts' && (
            <button
              type="button"
              onClick={saveEmailPreferences}
              disabled={isSavingEmailPrefs || emailPreferences.length === 0}
              className={pageActionButtonClass.primary}
            >
              {isSavingEmailPrefs ? t('common.saving') : t('lit.savePreferences')}
            </button>
          )}
          {activeTab === 'taskForm' && taskFormActions && (
            <>
              {taskFormActions.hasUserOverride && (
                <button
                  type="button"
                  onClick={taskFormActions.onReset}
                  disabled={taskFormActions.saving || taskFormActions.syncing}
                  className={pageActionButtonClass.secondary}
                >
                  {taskFormActions.syncing ? t('lit.resetting') : t('lit.useOrganizationDefault')}
                </button>
              )}
              {taskFormActions.canManage && (
                <button
                  type="button"
                  onClick={taskFormActions.onSave}
                  disabled={taskFormActions.saving || taskFormActions.syncing}
                  className={pageActionButtonClass.primary}
                >
                  {taskFormActions.saving ? t('common.saving') : t('lit.savePersonalOverride')}
                </button>
              )}
            </>
          )}
        </PageStickyActions>
      )}

      <ScrollToTopButton scrollContainerRef={scrollContainerRef} />

      <ConfirmAlertModal
        isOpen={recurringDeleteId !== null}
        type="confirm"
        title={t('lit.deleteRecurringTask')}
        message={t('lit.areYouSureYouWantToDeleteThisRecurringTaskThisWillRemoveAllFutureOccurre')}
        onClose={() => setRecurringDeleteId(null)}
        onConfirm={() => void confirmDeleteRecurring()}
        confirmLabel={t('common.delete')}
        confirmVariant="danger"
      />
    </div>
  );
}
