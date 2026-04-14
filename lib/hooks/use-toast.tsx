// lib/hooks/use-toast.tsx
//
// Minimal toast store + hook. Patterned after shadcn's use-toast but
// trimmed to the ~80 lines we actually need.
//
//   const { toast } = useToast();
//   toast({ title: "Cancel requested", variant: "success" });
//
// <Toaster /> (mounted in app/layout.tsx) subscribes to this store and
// renders the current toasts.

"use client";

import * as React from "react";
import type { ToastProps } from "@/components/ui/toast";

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

type ToastInput = Omit<ToasterToast, "id"> & { duration?: number };

type Listener = (toasts: ToasterToast[]) => void;

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 4000;

let count = 0;
const listeners: Listener[] = [];
let memory: ToasterToast[] = [];

function emit() {
  for (const l of listeners) l(memory);
}

function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

export function toast(input: ToastInput): { id: string; dismiss: () => void } {
  const id = genId();
  const duration = input.duration ?? DEFAULT_DURATION;
  const t: ToasterToast = { ...input, id, open: true };
  memory = [t, ...memory].slice(0, MAX_TOASTS);
  emit();

  if (duration > 0) {
    window.setTimeout(() => dismiss(id), duration);
  }

  return { id, dismiss: () => dismiss(id) };
}

function dismiss(id: string) {
  memory = memory.filter((t) => t.id !== id);
  emit();
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToasterToast[]>(memory);

  React.useEffect(() => {
    const listener: Listener = (ts) => setToasts(ts);
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);

  return { toasts, toast, dismiss };
}
