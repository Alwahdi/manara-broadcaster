import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { SetupStep } from "@/components/SetupStep";
import { clearSetup, setSetup, useSetup } from "@/hooks/useSetup";
import { api } from "@/lib/api";
import { setupAdminUrl } from "@/lib/setupRedirect";

export function SetupAdminAccount() {
  const data = useSetup();
  const recoveryInitialized = useRef(false);
  const recoveryMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("recovery") === "1";
  const recoveryState = useQuery({
    queryKey: ["agent-state", "admin-recovery"],
    queryFn: api.agentState,
    enabled: recoveryMode,
  });
  const saveRecovery = useMutation({
    mutationFn: () =>
      api.saveSettings({
        adminRecovery: true,
        adminUsername: data.adminUsername,
        adminPassword: data.adminPassword,
      }),
    onSuccess: (res) => {
      clearSetup();
      const target = setupAdminUrl(res.state?.urls?.adminLocal, window.location.href);
      setTimeout(() => {
        window.location.href = target;
      }, 900);
    },
  });

  useEffect(() => {
    if (!recoveryMode || !recoveryState.isSuccess || recoveryInitialized.current) return;
    recoveryInitialized.current = true;
    const username = String(recoveryState.data?.settings?.adminUsername || data.adminUsername || "admin").trim() || "admin";
    if (data.adminUsername !== username || data.adminPassword) {
      setSetup({ adminUsername: username, adminPassword: "" });
    }
  }, [data.adminPassword, data.adminUsername, recoveryMode, recoveryState.isSuccess, recoveryState.data?.settings?.adminUsername]);

  const password = data.adminPassword || "";
  const valid = !!data.adminUsername && password.length >= 10 && /[a-z]/i.test(password) && /\d/.test(password) && /[^a-z0-9]/i.test(password);
  return (
    <SetupStep
      title={recoveryMode ? "إعادة تعيين دخول المشرف" : "حساب المشرف"}
      subtitle={recoveryMode ? "أنشئ كلمة مرور جديدة للمشرف من هذا الجهاز فقط." : "أنشئ بيانات الدخول للوحة الإدارة."}
      prev={recoveryMode ? undefined : "/setup/network"}
      next={recoveryMode ? undefined : "/setup/branding"}
      onNext={recoveryMode ? (() => saveRecovery.mutate()) : undefined}
      nextLabel={
        recoveryMode
          ? (saveRecovery.isPending ? "جارٍ الحفظ…" : saveRecovery.isSuccess ? "تم ✓" : "حفظ كلمة المرور الجديدة")
          : "التالي"
      }
      nextDisabled={recoveryMode ? (!recoveryState.isSuccess || !valid || saveRecovery.isPending || saveRecovery.isSuccess) : !valid}
    >
      <div className="card card-pad">
        {recoveryMode ? (
          <div className="state" style={{ marginBottom: 16 }}>
            <div className="state-title">استرجاع محلي فقط</div>
            <p className="state-text">هذه الصفحة صالحة مؤقتاً على هذا الجهاز فقط، وستُنهي جلسات الإدارة السابقة عند حفظ كلمة المرور الجديدة.</p>
          </div>
        ) : null}
        <div className="field">
          <label>اسم المستخدم *</label>
          <input className="input" autoComplete="username" disabled={recoveryMode && (!recoveryState.isSuccess || saveRecovery.isPending || saveRecovery.isSuccess)} value={data.adminUsername || ""} onChange={(e) => setSetup({ adminUsername: e.target.value })} />
        </div>
        <div className="field">
          <label>كلمة المرور *</label>
          <input className="input" type="password" autoComplete="new-password" disabled={recoveryMode && (!recoveryState.isSuccess || saveRecovery.isPending || saveRecovery.isSuccess)} value={data.adminPassword || ""} onChange={(e) => setSetup({ adminPassword: e.target.value })} />
          <span className="hint">10 أحرف على الأقل، مع حرف ورقم ورمز. تُخزّن بشكل مُجزّأ على الخادم.</span>
        </div>
      </div>
      {recoveryMode && recoveryState.isError ? <p role="alert">تعذّر تحميل بيانات الاسترجاع. <button className="btn btn-ghost" onClick={() => recoveryState.refetch()}>إعادة المحاولة</button></p> : null}
      {saveRecovery.isError ? <p role="alert" style={{ color: "var(--danger)" }}>{(saveRecovery.error as Error).message}</p> : null}
      {recoveryMode && saveRecovery.isSuccess ? <p className="gold">تم حفظ كلمة المرور الجديدة — جارٍ فتح لوحة الإدارة…</p> : null}
    </SetupStep>
  );
}
