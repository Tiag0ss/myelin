'use client';

/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CustomerPortalPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, []);
  return null;
}
