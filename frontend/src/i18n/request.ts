import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { DEFAULT_TIME_ZONE } from "./timeZone";

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

  // The time zone has to be explicit, and has to match what the client provider
  // is given — see `./timeZone`.
  return { locale, messages, timeZone: DEFAULT_TIME_ZONE };
});
