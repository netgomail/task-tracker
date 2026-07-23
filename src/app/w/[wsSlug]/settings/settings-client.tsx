"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { confirmDialog } from "@/components/confirm-dialog";
import { Check, Shield, Trash2, UserPlus, UserRound } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { WorkspaceMember } from "@/services/membership";
import type { MembershipRole } from "@/domain/types";
import {
  addMemberAction,
  renameWorkspaceAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/actions/workspaces";

const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  member: "Участник",
  viewer: "Наблюдатель",
};

const ASSIGNABLE_ROLES: MembershipRole[] = ["admin", "member", "viewer"];

export function RenameForm({
  wsSlug,
  currentName,
}: {
  wsSlug: string;
  currentName: string;
}) {
  const [draft, setDraft] = useState(currentName);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (!next || next === currentName) return;
    startTransition(async () => {
      const res = await renameWorkspaceAction(wsSlug, next);
      if (!res.ok) toast.error(res.error);
      else toast.success("Название обновлено");
    });
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-3">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="max-w-xs"
        placeholder="Название пространства"
        disabled={pending}
      />
      <Button
        type="submit"
        size="sm"
        disabled={pending || draft.trim() === currentName || !draft.trim()}
      >
        {pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}

export function MembersList({
  wsSlug,
  meId,
  myRole,
  initialMembers,
}: {
  wsSlug: string;
  meId: string;
  myRole: MembershipRole;
  initialMembers: WorkspaceMember[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<MembershipRole>("member");
  const [addPending, startAddTransition] = useTransition();

  const canManage = myRole === "owner" || myRole === "admin";

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    startAddTransition(async () => {
      const res = await addMemberAction(wsSlug, trimmed, newRole);
      if (!res.ok) toast.error(res.error);
      else {
        setMembers((prev) => [...prev, res.member]);
        setEmail("");
        toast.success(`${res.member.name} добавлен в пространство`);
      }
    });
  }

  function handleRoleChange(m: WorkspaceMember, role: MembershipRole) {
    startTransition(async () => {
      const res = await updateMemberRoleAction(wsSlug, m.memberId, role);
      if (!res.ok) toast.error(res.error);
      else {
        setMembers((prev) => prev.map((x) => (x.memberId === m.memberId ? { ...x, role } : x)));
        toast.success(`Роль ${m.name} изменена`);
      }
    });
  }

  async function handleRemove(m: WorkspaceMember) {
    const ok = await confirmDialog({
      title: "Удалить участника?",
      description: `${m.name} потеряет доступ к пространству.`,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await removeMemberAction(wsSlug, m.memberId);
      if (!res.ok) toast.error(res.error);
      else {
        setMembers((prev) => prev.filter((x) => x.memberId !== m.memberId));
        toast.success(`${m.name} удалён из пространства`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="h-8 max-w-xs text-sm"
            disabled={addPending}
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as MembershipRole)}
            disabled={addPending}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={addPending || !email.trim()}>
            <UserPlus className="size-3.5" />
            {addPending ? "Добавляем…" : "Добавить"}
          </Button>
        </form>
      )}
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {members.map((m) => {
          const isMe = m.id === meId;
          const isOwner = m.role === "owner";
          const showActions = canManage && !isMe && !isOwner;

          return (
            <li key={m.memberId} className="flex items-center gap-3 px-4 py-3">
              <Avatar className="size-8 shrink-0">
                {m.image && <AvatarImage src={m.image} alt={m.name} />}
                <AvatarFallback className="text-sm">
                  {m.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {m.name}
                  {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(вы)</span>}
                </span>
              </div>
              {showActions ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={pending}
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition hover:bg-accent disabled:opacity-50",
                        "text-muted-foreground",
                      )}
                    >
                      <Shield className="size-3" />
                      {ROLE_LABELS[m.role]}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {ASSIGNABLE_ROLES.map((r) => (
                      <DropdownMenuItem
                        key={r}
                        onSelect={() => handleRoleChange(m, r)}
                        disabled={r === m.role}
                      >
                        <span className="flex-1">{ROLE_LABELS[r]}</span>
                        {r === m.role && <Check className="size-3.5" />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => handleRemove(m)}
                      variant="destructive"
                    >
                      <Trash2 className="size-4" />
                      Удалить из пространства
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground">
                  <Shield className="size-3" />
                  {ROLE_LABELS[m.role]}
                </span>
              )}
            </li>
          );
        })}
        {members.length === 0 && (
          <li className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <UserRound className="size-4" /> Нет участников
          </li>
        )}
      </ul>
    </div>
  );
}
