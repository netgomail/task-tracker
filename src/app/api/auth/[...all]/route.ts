import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Эндпоинты, требующие защиты от брутфорса
const RATE_LIMITED_PATHS = ["/api/auth/sign-in", "/api/auth/sign-up"];

const handler = toNextJsHandler(auth);

async function withRateLimit(request: NextRequest, method: "GET" | "POST") {
  const { pathname } = request.nextUrl;
  const needsLimit = method === "POST" && RATE_LIMITED_PATHS.some((p) => pathname.startsWith(p));

  if (needsLimit) {
    const ip = getClientIp(request);
    // Без доверенного прокси все клиенты выглядят одним IP («direct»),
    // поэтому жёсткий лимит вешаем на пару ip+email, а на IP — только
    // широкий колпак от распределённого перебора.
    const email = await request
      .clone()
      .json()
      .then((body: unknown) =>
        body && typeof body === "object" && "email" in body && typeof body.email === "string"
          ? body.email.toLowerCase().trim()
          : "",
      )
      .catch(() => "");

    const perTarget = checkRateLimit(`auth:${ip}:${email}`, 5);
    const perIp = checkRateLimit(`auth:${ip}`, 30);
    const blocked = !perTarget.allowed ? perTarget : !perIp.allowed ? perIp : null;

    if (blocked && !blocked.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток. Повторите позже." },
        {
          status: 429,
          headers: {
            "Retry-After": String(blocked.retryAfterSeconds),
            "X-RateLimit-Limit": "5",
          },
        },
      );
    }
  }

  return method === "GET" ? handler.GET(request) : handler.POST(request);
}

export function GET(request: NextRequest) {
  return withRateLimit(request, "GET");
}

export function POST(request: NextRequest) {
  return withRateLimit(request, "POST");
}
