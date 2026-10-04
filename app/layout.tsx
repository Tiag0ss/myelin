import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { DM_Sans, Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import BrandingRuntime from "@/components/BrandingRuntime";
import PreferencesRuntime from "@/components/PreferencesRuntime";
import PwaRegister from "@/components/PwaRegister";
import AuthenticatedAppGate from "@/components/AuthenticatedAppGate";
import { PREFERENCES_EARLY_APPLY_SCRIPT } from "@/lib/colorVision";
import { getPublicBranding, inferFaviconType } from "@/lib/branding/publicBranding.server";
import { I18nProvider } from "@/lib/i18n/provider";
import { LOCALE_COOKIE, htmlLang } from "@/lib/i18n/config";
import { detectLocaleFromHints } from "@/lib/i18n/detectLocale";
import { loadLitServer } from "@/lib/i18n/loadLit.server";
import { t as tServer } from "@/lib/i18n/messages.server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Synapse shell fonts. */
const dmSans = DM_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-dm-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0a0e13",
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const { companyName, faviconUrl } = await getPublicBranding();
  const faviconType = inferFaviconType(faviconUrl);
  const cookieStore = await cookies();
  const hdrs = await headers();
  const locale = detectLocaleFromHints(
    cookieStore.get(LOCALE_COOKIE)?.value,
    String(
      hdrs.get("cf-ipcountry") ||
        hdrs.get("x-country-code") ||
        hdrs.get("x-vercel-ip-country") ||
        ""
    ),
    String(hdrs.get("accept-language") || "")
  );

  return {
    title: companyName,
    description: tServer(locale, 'lit.manageYourProjectsEfficiently'),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: companyName,
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        ...(faviconType
          ? [{ url: faviconUrl, type: faviconType }]
          : [{ url: faviconUrl }]),
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      shortcut: faviconUrl,
      apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const hdrs = await headers();
  const locale = detectLocaleFromHints(
    cookieStore.get(LOCALE_COOKIE)?.value,
    String(
      hdrs.get("cf-ipcountry") ||
        hdrs.get("x-country-code") ||
        hdrs.get("x-vercel-ip-country") ||
        ""
    ),
    String(hdrs.get("accept-language") || "")
  );
  const initialLit = loadLitServer(locale);
  const initialFallbackLit = locale === 'en' ? initialLit : loadLitServer('en');

  return (
    <html lang={htmlLang(locale)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_EARLY_APPLY_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${ibmPlexMono.variable} antialiased`}
      >
        <I18nProvider
          initialLocale={locale}
          initialLit={initialLit}
          initialFallbackLit={initialFallbackLit}
        >
          <AuthProvider>
            <PermissionsProvider>
              <ToastProvider>
                <PreferencesRuntime />
                <BrandingRuntime />
                <PwaRegister />
                <AuthenticatedAppGate>{children}</AuthenticatedAppGate>
              </ToastProvider>
            </PermissionsProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
