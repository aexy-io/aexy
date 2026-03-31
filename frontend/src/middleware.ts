import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_LOCALES = ["en", "hi"];
const DEFAULT_LOCALE = "en";

export function middleware(request: NextRequest) {
  // Read locale from cookie
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const locale =
    cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)
      ? cookieLocale
      : DEFAULT_LOCALE;

  // Set locale header for i18n/request.ts to read
  const response = NextResponse.next();
  response.headers.set("x-locale", locale);

  return response;
}

export const config = {
  // Match all routes except static files, api routes, and Next.js internals
  matcher: ["/((?!_next|api|favicon.ico|.*\\..*).*)"],
};
