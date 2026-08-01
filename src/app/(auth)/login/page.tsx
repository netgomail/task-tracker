import { Suspense } from "react";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { getSession } from "@/lib/rbac";

import { LoginForm } from "./login-form";

export const metadata = { title: "Вход — Task Tracker" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/workspaces");

  return (
    <Suspense>
      <LoginForm registrationEnabled={!env.DISABLE_REGISTRATION} />
    </Suspense>
  );
}
