import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-xl flex-col items-start gap-6">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Task Tracker
        </span>
        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
          Лёгкая доска задач для проектов и команд.
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
          Создавайте проекты, настраивайте колонки, ведите задачи с приоритетами, метками,
          подзадачами и комментариями. Перетаскивайте карточки мышью или с клавиатуры.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/login">Войти</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/register">Создать аккаунт</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
