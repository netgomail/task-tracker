import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/rbac";
import { env } from "@/lib/env";

import { LoginForm } from "./login-form";

export const metadata = { title: "Вход — Task Tracker" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/workspaces");

  const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <Suspense>
      <LoginForm googleEnabled={googleEnabled} />
    </Suspense>
  );
}
