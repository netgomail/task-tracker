"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspaceAction } from "@/actions/workspaces";
import type { ActionResult } from "@/actions/_shared";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Создаём…" : "Создать"}
    </Button>
  );
}

export function NewWorkspaceForm({ defaultName = "" }: { defaultName?: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => createWorkspaceAction(_prev, formData),
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="ws-name">Название</Label>
        <Input
          id="ws-name"
          name="name"
          placeholder="Например, Команда продукта или Личные задачи"
          defaultValue={defaultName}
          required
        />
        {state && !state.ok && (
          <p className="text-xs text-destructive">{state.error}</p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}
