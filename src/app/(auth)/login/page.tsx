import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata = { title: "Вход — Task Tracker" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
