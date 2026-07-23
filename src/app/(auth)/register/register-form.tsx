"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";

const RegisterSchema = z.object({
  name: z.string().min(2, "Введите имя"),
  email: z.string().email("Введите корректный e-mail"),
  password: z.string().min(8, "Минимум 8 символов"),
});

type RegisterInput = z.infer<typeof RegisterSchema>;

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(RegisterSchema) });

  async function onSubmit(values: RegisterInput) {
    setPending(true);
    const result = await signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error.message ?? "Не удалось зарегистрироваться");
      return;
    }
    router.push("/workspaces");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Регистрация</h1>
        <p className="text-sm text-muted-foreground">Создайте аккаунт за полминуты.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Имя</Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            autoFocus
            {...register("name")}
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
            aria-invalid={!!errors.password}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? "Создаём…" : "Создать аккаунт"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
