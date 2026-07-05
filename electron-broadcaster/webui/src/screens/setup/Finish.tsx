import { useMutation } from "@tanstack/react-query";
import { SetupStep } from "@/components/SetupStep";
import { api } from "@/lib/api";
import { useSetup, clearSetup } from "@/hooks/useSetup";

export function SetupFinish() {
  const data = useSetup();
  const save = useMutation({
    mutationFn: () =>
      api.saveSettings({
        ...data,
        setupCompleted: true,
      }),
    onSuccess: (res) => {
      clearSetup();
      const target = res.state?.urls?.adminLocal || "/admin/dashboard";
      setTimeout(() => {
        window.location.href = target;
      }, 900);
    },
  });

  return (
    <SetupStep
      title="جاهز للانطلاق"
      subtitle="راجع البيانات ثم أكمل الإعداد."
      prev="/setup/iptv"
      onNext={() => save.mutate()}
      nextLabel={save.isPending ? "جارٍ الحفظ…" : save.isSuccess ? "تم ✓" : "إنهاء الإعداد"}
      nextDisabled={save.isPending || save.isSuccess || !data.networkName}
    >
      <div className="card card-pad">
        <Row label="اسم الشبكة" value={data.networkName} />
        <Row label="المشرف" value={data.adminUsername} />
        <Row label="العلامة" value={data.brandName || data.networkName} />
        <Row label="طريقة العرض" value={(data.experienceLayout || "unified") === "separate" ? "منفصلة" : "موحدة"} />
        <Row label="منفذ البث" value={data.livePort || "8787"} />
        <Row label="منفذ الإدارة" value={data.adminPort || "8788"} />
        <Row label="مجلد المكتبة" value={data.libraryPath || "—"} />
        <Row label="IPTV" value={data.iptvUrl || "—"} />
      </div>
      {save.isError ? <p style={{ color: "var(--danger)" }}>{(save.error as Error).message}</p> : null}
      {save.isSuccess ? <p className="gold">تم حفظ الإعداد — جارٍ فتح لوحة الإدارة…</p> : null}
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
