import { redirect } from "next/navigation";

import { getSession } from "@/lib/rbac";

import { RegisterForm } from "./register-form";

export const metadata = { title: "Регистрация — Task Tracker" };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect("/workspaces");

  return <RegisterForm />;
}
