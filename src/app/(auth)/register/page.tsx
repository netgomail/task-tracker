import { notFound, redirect } from "next/navigation";

import { env } from "@/lib/env";
import { getSession } from "@/lib/rbac";

import { RegisterForm } from "./register-form";

export const metadata = { title: "Регистрация — Task Tracker" };

export default async function RegisterPage() {
  if (env.DISABLE_REGISTRATION) notFound();

  const session = await getSession();
  if (session) redirect("/workspaces");

  return <RegisterForm />;
}
