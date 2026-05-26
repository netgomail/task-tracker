import { redirect } from "next/navigation";

import { getSession } from "@/lib/rbac";
import { env } from "@/lib/env";

import { RegisterForm } from "./register-form";

export const metadata = { title: "Регистрация — Task Tracker" };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect("/workspaces");

  const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return <RegisterForm googleEnabled={googleEnabled} />;
}
