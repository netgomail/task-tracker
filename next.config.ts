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
  // Content Security Policy — запрет загрузки ресурсов со сторонних доменов
  // unsafe-inline нужен для Next.js inline styles/scripts в dev-режиме
  // в продакшене Next.js добавляет nonce автоматически через заголовки
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js требует 'unsafe-eval' в dev, в prod только 'self'
      isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'", // Tailwind inline styles
      "img-src 'self' data: blob:",       // data: для аватаров, blob: для превью
      "font-src 'self'",
      "connect-src 'self'",               // fetch/XHR только к своему домену
      "frame-ancestors 'self'",           // дублирует X-Frame-Options для новых браузеров
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
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
