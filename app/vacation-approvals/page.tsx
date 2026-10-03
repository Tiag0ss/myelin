import { useI18n } from '@/lib/i18n/provider';
/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import { redirect } from 'next/navigation';

export default function VacationApprovalsRedirectPage() {
  const { t } = useI18n();
  redirect('/approvals?tab=vacations');
}
