"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProjectAction } from "@/actions/projects";
import type { ActionResult } from "@/actions/_shared";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Создаём…" : "Создать"}
    </Button>
  );
}

export function NewProjectForm({
  wsSlug,
  onSuccess,
}: {
  wsSlug: string;
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      const result = await createProjectAction(wsSlug, formData);
      if (result.ok) onSuccess?.();
      return result;
    },
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="project-name">Название</Label>
        <Input id="project-name" name="name" placeholder="Например, Сайт v2" required />
        {state && !state.ok && (
          <p className="text-xs text-destructive">{state.error}</p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}
