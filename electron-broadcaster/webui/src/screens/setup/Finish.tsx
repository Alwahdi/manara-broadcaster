import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AppLink } from "@/components/AppLink";
import { SetupStep } from "@/components/SetupStep";
import { api } from "@/lib/api";
import { useSetup, clearSetup } from "@/hooks/useSetup";
import { setupAdminUrl } from "@/lib/setupRedirect";

export function SetupFinish() {
  const data = useSetup();
  const [adminUrl, setAdminUrl] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api.saveSettings({
        ...data,
        libraryPath: undefined,
        iptvUrl: undefined,
        livePort: data.livePort?.trim() || undefined,
        adminPort: data.adminPort?.trim() || undefined,
        setupCompleted: true,
      }),
    onSuccess: (res) => {
      clearSetup();
      setAdminUrl(setupAdminUrl(res.state?.urls?.adminLocal, window.location.href));
    },
  });

  if (save.isSuccess) return (
    <div>
      <h1 className="page-title">تم حفظ إعداد الشبكة</h1>
      <p role="status">الخطوة التالية: سجّل دخول المشرف لإضافة المحتوى والتحقق من ظهوره للمشاهدين.</p>
      <div className="card card-pad">
        <h2>إضافة المحتوى</h2>
        <ul>
          <li>المكتبة: «مصادر التخزين» ← اختيار المجلد ← فحص المصدر.</li>
          <li>القنوات: «قنوات IPTV» ← استيراد ← معاينة واختيار القنوات.</li>
        </ul>
        <p className="hint">حُفظت إعدادات الشبكة فقط؛ لم تُضف مصادر أو قنوات بعد.</p>
      </div>
      <a href={adminUrl} className="btn btn-primary" style={{ marginTop: 20 }}>فتح لوحة الإدارة</a>
    </div>
  );

  const missing = !data.networkName?.trim() ? "network" : !data.adminUsername?.trim() || !data.adminPassword ? "admin-account" : "";
  return (
    <SetupStep
      title="جاهز للانطلاق"
      subtitle="راجع البيانات ثم أكمل الإعداد."
      prev="/setup/ports"
      onNext={() => save.mutate()}
      nextLabel={save.isPending ? "جارٍ الحفظ…" : "إنهاء الإعداد"}
      nextDisabled={save.isPending || !!missing}
    >
      <div className="card card-pad">
        <Row label="اسم الشبكة" value={data.networkName} />
        <Row label="المشرف" value={data.adminUsername} />
        <Row label="العلامة" value={data.brandName || data.networkName} />
        <Row label="طريقة العرض" value={(data.experienceLayout || "unified") === "separate" ? "منفصلة" : "موحدة"} />
        <Row label="منفذ البث" value={data.livePort || "8787"} />
        <Row label="منفذ الإدارة" value={data.adminPort || "8788"} />
        <p className="hint">تُضاف مصادر المكتبة وقنوات IPTV من لوحة الإدارة بعد تسجيل الدخول.</p>
      </div>
      {missing ? <p role="alert">أكمل بيانات {missing === "network" ? "الشبكة" : "حساب المشرف"} قبل الحفظ. <AppLink href={`/setup/${missing}`}>إكمال البيانات</AppLink></p> : null}
      {save.isError ? <p role="alert" style={{ color: "var(--danger)" }}>{(save.error as Error).message}</p> : null}
    </SetupStep>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="muted">{label}</span>
      <strong className="truncate" style={{ maxWidth: "60%" }}>{value || "—"}</strong>
    </div>
  );
}
