// components/ui/toaster.tsx
//
// Mount point for the toast viewport. Goes in app/layout.tsx once at the
// root. Subscribes to the store exposed by lib/hooks/use-toast.

"use client";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/lib/hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider swipeDirection="right" duration={99999}>
      {toasts.map((t) => (
        <Toast key={t.id} variant={t.variant}>
          <div className="flex-1 min-w-0">
            {t.title && <ToastTitle>{t.title}</ToastTitle>}
            {t.description && (
              <ToastDescription>{t.description}</ToastDescription>
            )}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
