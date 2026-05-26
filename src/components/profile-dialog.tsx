"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Mail, ShieldCheck, User2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  changePasswordAction,
  getProfileAction,
  updateProfileAction,
  type ProfileData,
} from "@/actions/profile";

type Tab = "profile" | "security";

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [tab, setTab] = useState<Tab>("profile");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(null);
    getProfileAction().then((data) => {
      if (!cancelled) setProfile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Профиль</DialogTitle>
          <DialogDescription className="sr-only">Настройки аккаунта и безопасность.</DialogDescription>
        </DialogHeader>

        {!profile ? (
          <div className="flex flex-1 items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 border-b border-border">
              <TabButton active={tab === "profile"} onClick={() => setTab("profile")}>
                Профиль
              </TabButton>
              {profile.hasPassword && (
                <TabButton active={tab === "security"} onClick={() => setTab("security")}>
                  Безопасность
                </TabButton>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-5">
              {tab === "profile" && (
                <ProfileTab
                  profile={profile}
                  onNameUpdate={(name) => setProfile((p) => (p ? { ...p, name } : p))}
                />
              )}
              {tab === "security" && profile.hasPassword && <SecurityTab />}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileTab({
  profile,
  onNameUpdate,
}: {
  profile: ProfileData;
  onNameUpdate: (name: string) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [pending, startTransition] = useTransition();

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === profile.name) {
      setName(profile.name);
      return;
    }
    startTransition(async () => {
      const res = await updateProfileAction(trimmed);
      if (res.ok) {
        toast.success("Имя обновлено");
        onNameUpdate(trimmed);
      } else {
        toast.error(res.error ?? "Ошибка");
        setName(profile.name);
      }
    });
  }

  const initials = profile.name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const createdAt = new Date(profile.createdAt).toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {profile.image && <AvatarImage src={profile.image} alt={profile.name} />}
          <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-lg font-semibold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-semibold">{profile.name}</span>
          <span className="text-sm text-muted-foreground">{profile.email}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Отображаемое имя</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") setName(profile.name);
          }}
          disabled={pending}
          maxLength={100}
          placeholder="Ваше имя"
        />
        <p className="text-xs text-muted-foreground">Изменится в комментариях и на доске.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>E-mail</Label>
        <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
          <Mail className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{profile.email}</span>
          {profile.emailVerified ? (
            <span className="flex shrink-0 items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Check className="size-3" />
              Подтверждён
            </span>
          ) : (
            <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
              Не подтверждён
            </span>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <User2 className="size-3.5 shrink-0" />
          <span>Аккаунт создан {createdAt}</span>
        </div>
        {profile.providers.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span>Вход через:</span>
            {profile.providers.map((p) => (
              <span
                key={p}
                className="rounded bg-background px-1.5 py-0.5 font-medium text-foreground/80 ring-1 ring-border"
              >
                {p === "credential" ? "Email / пароль" : p === "google" ? "Google" : p}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("Новый пароль и подтверждение не совпадают");
      return;
    }
    startTransition(async () => {
      const res = await changePasswordAction(current, next);
      if (res.ok) {
        toast.success("Пароль успешно изменён");
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        toast.error(res.error ?? "Ошибка");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sec-current">Текущий пароль</Label>
        <Input
          id="sec-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sec-new">Новый пароль</Label>
        <Input
          id="sec-new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">Минимум 8 символов.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sec-confirm">Подтвердить пароль</Label>
        <Input
          id="sec-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={pending}
        />
      </div>
      <Button
        type="submit"
        disabled={pending || !current || !next || !confirm}
        className="self-start"
      >
        {pending ? "Сохраняем…" : "Изменить пароль"}
      </Button>
    </form>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
