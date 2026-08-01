import { z } from "zod";

// Не z.coerce.boolean(): он любую непустую строку (включая "false") даёт true.
const boolFlag = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (postgres://…)"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /** Доверять X-Forwarded-For / X-Real-IP. Включать ТОЛЬКО за reverse-proxy,
   * который перезаписывает эти заголовки, — иначе rate limit обходится подделкой. */
  TRUSTED_PROXY: boolFlag,
  /** Отключает самостоятельную регистрацию (страница /register и API sign-up). */
  DISABLE_REGISTRATION: boolFlag,
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid environment variables. See .env.example.");
}

export const env = parsed.data;
