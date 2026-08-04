import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const locales = ["th", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "th";
export const LOCALE_COOKIE = "locale";

/**
 * Cookie-based locale (no /en, /th URL prefixes) so it composes cleanly with the
 * Supabase auth middleware. Default is Thai.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = (locales as readonly string[]).includes(
    cookieLocale ?? ""
  )
    ? (cookieLocale as Locale)
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Never crash a page over a missing key — show the label and log instead.
    onError(error) {
      if (error.code === "MISSING_MESSAGE") return;
      console.error(error);
    },
    getMessageFallback({ key }) {
      return key.split(".").pop() ?? key;
    },
  };
});
