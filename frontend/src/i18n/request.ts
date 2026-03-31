import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const SUPPORTED_LOCALES = ["en", "hi"];
const DEFAULT_LOCALE = "en";

export default getRequestConfig(async () => {
  // Read locale from cookie (set by middleware and client-side locale store)
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale =
    cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)
      ? cookieLocale
      : DEFAULT_LOCALE;

  // Single JSON file per locale — loaded once, cached by Next.js
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages };
});
