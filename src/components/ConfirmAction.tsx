import { useState } from "react";
import type { ReactNode } from "react";

export function ConfirmAction({
  title = "تأكيد الإجراء",
  message,
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  className = "",
  children,
  onConfirm,
}: {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  className?: string;
  children: ReactNode;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function runConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" dir="rtl">
          <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-elegant sm:rounded-3xl">
            <h3 className="text-lg font-extrabold">{title}</h3>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{message}</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold transition hover:bg-surface-2">
                {cancelText}
              </button>
              <button type="button" onClick={runConfirm} disabled={busy} className="flex-1 rounded-xl bg-destructive px-4 py-3 text-sm font-bold text-destructive-foreground transition disabled:opacity-50">
                {busy ? "جاري التنفيذ..." : confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
