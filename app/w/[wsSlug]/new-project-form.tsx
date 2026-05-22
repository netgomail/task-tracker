"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProjectAction, type ActionResult } from "@/actions/projects";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Создаём…" : "Создать"}
    </Button>
  );
}

export function NewProjectForm({ wsSlug }: { wsSlug: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => createProjectAction(wsSlug, formData),
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
