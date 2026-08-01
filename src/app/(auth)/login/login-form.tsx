"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

const LoginSchema = z.object({
  email: z.string().email("Введите корректный e-mail"),
  password: z.string().min(8, "Минимум 8 символов"),
});

type LoginInput = z.infer<typeof LoginSchema>;

export function LoginForm({ registrationEnabled }: { registrationEnabled: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") ?? "/workspaces";
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  async function onSubmit(values: LoginInput) {
    setPending(true);
    const result = await signIn.email({
      email: values.email,
      password: values.password,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error.message ?? "Не удалось войти");
      return;
    }
    router.push(nextPath);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Вход</h1>
        <p className="text-sm text-muted-foreground">Войдите по e-mail и паролю.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            {...register("email")}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            aria-invalid={!!errors.password}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? "Входим…" : "Войти"}
        </Button>
      </form>
      {registrationEnabled && (
        <p className="text-sm text-muted-foreground">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      )}
    </div>
  );
}
