import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_PREFIXES = ["/w", "/workspaces"];
const AUTH_PAGES = ["/login", "/register"];

const isDev = process.env.NODE_ENV === "development";

// CSP с per-request nonce. В script-src нет 'unsafe-inline': inline-скрипты
// бутстрапа Next.js исполняются только при совпадении nonce, а 'strict-dynamic'
// распространяет доверие на чанки, которые они подгружают. style-src оставляет
// 'unsafe-inline' (Tailwind/Next вставляют inline-стили без nonce). Без
// upgrade-insecure-requests — приложение работает по http://NAS_IP:3000.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  // CVE-2025-29927: блокируем заголовок, который позволял обходить middleware
  // в Next.js 11–15. Версия 16 не уязвима, но блокируем для защиты в глубину.
  if (request.headers.has("x-middleware-subrequest")) {
    return new NextResponse(null, { status: 403 });
  }

  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isProtected && !sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/workspaces";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  // Генерируем nonce на каждый запрос и кладём его в CSP-заголовок запроса:
  // Next.js при динамическом рендере читает 'nonce-...' из него и проставляет
  // своим <script>. x-nonce — на случай чтения через headers() в коде.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
