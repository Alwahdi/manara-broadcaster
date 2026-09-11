"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

function standaloneMode() {
  return typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaInstallCard() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setInstalled(standaloneMode());
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return undefined;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setInstalled(standaloneMode());
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setMessage("تم تثبيت WIVA على هذا الجهاز.");
    };
    const onDisplayMode = () => setInstalled(standaloneMode());
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    mediaQuery.addEventListener?.("change", onDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mediaQuery.removeEventListener?.("change", onDisplayMode);
    };
  }, []);

  const helpText = useMemo(() => {
    if (installed) return "تمت إضافة WIVA كتطبيق، ويمكن فتحه مباشرة من شاشة التطبيقات أو سطح المكتب.";
    if (promptEvent) return "ثبّت WIVA كتطبيق للوصول السريع من دون كتابة الرابط كل مرة.";
    return "إذا لم يظهر زر التثبيت، افتح قائمة المتصفح ثم اختر إضافة إلى الشاشة الرئيسية أو تثبيت التطبيق.";
  }, [installed, promptEvent]);

  const install = async () => {
    if (!promptEvent) return;
    setInstalling(true);
    setMessage("");
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        setMessage("جارٍ إكمال تثبيت WIVA على جهازك.");
      } else {
        setMessage("يمكنك التثبيت لاحقًا من هذا الزر أو من قائمة المتصفح.");
      }
    } finally {
      setInstalling(false);
      setPromptEvent(null);
    }
  };

  if (installed) {
    return (
      <div className="account-admin-note">
        <strong>WIVA مثبت كتطبيق</strong>
        <span>{message || helpText}</span>
      </div>
    );
  }

  return (
    <div className="account-admin-note">
      <strong>ثبّت WIVA كتطبيق</strong>
      <span>{message || helpText}</span>
      {promptEvent ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={install} disabled={installing}>
          {installing ? "جارٍ الفتح…" : "تثبيت التطبيق"}
        </button>
      ) : null}
    </div>
  );
}
