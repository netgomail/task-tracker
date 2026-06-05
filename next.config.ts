import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  // Запрет встраивания страницы в <iframe> на других сайтах (clickjacking)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Браузер не угадывает MIME-тип файла — только то, что сервер объявил
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Не передавать полный URL в Referer при переходе на внешние сайты
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Запрет доступа к камере, микрофону, геолокации для встроенных фреймов
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Запрет DNS prefetch — небольшая утечка информации о навигации
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Content-Security-Policy задаётся в proxy.ts: ему нужен per-request nonce
  // для inline-скриптов Next.js (статический заголовок здесь это не умеет).
  // HSTS — только в продакшене (в dev нет HTTPS)
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Минимальный self-contained сервер для Docker: .next/standalone/server.js
  output: "standalone",
  async headers() {
    return [
      {
        // Применяем ко всем маршрутам
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
