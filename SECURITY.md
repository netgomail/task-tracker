# Security — Task Tracker

> Последнее обновление: 2026-05-25 (P2+P3 реализованы)

---

## Что уже защищено

| Слой | Механизм | Файл |
|---|---|---|
| Аутентификация | Better Auth, HttpOnly cookies, Origin-check CSRF | `src/lib/auth.ts` |
| Авторизация в actions | `requireUser()` в каждом Server Action | `src/lib/rbac.ts` |
| SQL-инъекции | Drizzle ORM — параметризованные запросы | `src/db/` |
| Утечка секретов | `import "server-only"` в services | `src/services/` |
| RBAC | `requireRole()`, роли owner/admin/member/viewer | `src/lib/rbac.ts` |
| Изоляция данных | `workspace_id` обязателен в каждом запросе | `src/services/` |
| Валидация входных данных | Zod-схемы во всех Server Actions | `src/actions/` |
| Защита маршрутов | `proxy.ts` — редирект на `/login` без сессии | `proxy.ts` |

---

## План мер безопасности

### 🔴 Приоритет 1 — Критично

| # | Мера | Статус | Файл |
|---|---|---|---|
| 1.1 | HTTP Security Headers (X-Frame-Options, CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy) | ✅ Реализовано | `next.config.ts` |
| 1.2 | Блокировка заголовка `x-middleware-subrequest` (CVE-2025-29927) | ✅ Реализовано | `proxy.ts` |
| 1.3 | Rate limiting на auth-эндпоинты (5 попыток / 15 мин с IP) | ✅ Реализовано | `src/lib/rate-limit.ts`, `src/app/api/auth/[...all]/route.ts` |

### 🟡 Приоритет 2 — Важно

| # | Мера | Статус | Файл |
|---|---|---|---|
| 2.1 | Санитизация текстовых полей (XSS в комментариях / описаниях) | ✅ Реализовано | `src/lib/sanitize.ts`, `src/actions/comments.ts`, `src/actions/tasks.ts` |
| 2.2 | Обновление drizzle-kit (moderate уязвимость в dev-зависимости) | ⚠️ Принято (v0.31.10 — последняя стабильная; CVE ссылается на старые pre-release версии) | `package.json` |
| 2.3 | Проверка `BETTER_AUTH_SECRET` (минимум 32 символа) | ✅ Реализовано (Zod min(32) при старте) | `src/lib/env.ts` |
| 2.4 | `Cache-Control: no-store` на SSE-эндпоинте `/api/stream` | ✅ Реализовано | `src/app/api/stream/[boardId]/route.ts` |

### 🟢 Приоритет 3 — Полировка

| # | Мера | Статус | Файл |
|---|---|---|---|
| 3.1 | Убрать отладочные `console.log` с session.user.id из продакшена | ✅ Реализовано | `src/app/w/[wsSlug]/p/[projectSlug]/page.tsx` |
| 3.2 | Логирование ForbiddenError (подозрительная активность) | ✅ Реализовано (`console.warn` в `requireRole`) | `src/lib/rbac.ts` |
| 3.3 | `npm audit` — мониторинг зависимостей в CI | ⏳ ожидает | `.github/workflows/` |

---

## CVE / Уязвимости

| CVE | Описание | Статус | Решение |
|---|---|---|---|
| CVE-2025-29927 | Bypass middleware через `x-middleware-subrequest` (Next.js 11–15) | ✅ Не затронуты (v16.2.6), блокируем для защиты в глубину | Блокировка в `proxy.ts` |
| CVE-2025-55182 | RCE в React Server Components Flight protocol | ✅ Не затронуты (React 19.2.4, фикс вышел в 19.1.0) | — |
| postcss XSS | Moderate в bundled postcss внутри next | ⚠️ Принято (фикс требует downgrade Next.js) | Мониторинг обновлений Next.js |

---

## Легенда статусов

- ✅ Реализовано
- ⏳ Ожидает / В работе
- ⚠️ Принято как допустимый риск
- ❌ Не реализовано
