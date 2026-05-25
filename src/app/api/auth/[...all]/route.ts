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
    const result = checkRateLimit(`auth:${ip}`);

    if (!result.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток. Повторите позже." },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSeconds),
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
