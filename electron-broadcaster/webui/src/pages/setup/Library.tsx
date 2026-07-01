import { useState } from "react";
import { SetupStep } from "@/components/SetupStep";
import { StorageBrowser } from "@/components/StorageBrowser";
import { useSetup, setSetup } from "@/hooks/useSetup";

export function SetupLibrary() {
  const data = useSetup();
  const [browsing, setBrowsing] = useState(false);
  return (
    <SetupStep
      title="مكتبة الوسائط"
      subtitle="اختر القرص أو المجلد الذي يحتوي على وسائطك."
      prev="/setup/ports"
      next="/setup/iptv"
    >
      {browsing ? (
        <div>
          <StorageBrowser
            selectLabel="استخدام هذا المجلد"
            onSelect={(path) => {
              setSetup({ libraryPath: path });
              setBrowsing(false);
            }}
          />
          <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setBrowsing(false)}>إغلاق المتصفح</button>
        </div>
      ) : (
        <div className="card card-pad">
          <div className="row-between">
            <div>
              <div className="muted">مجلد المكتبة</div>
              <code className="mono">{data.libraryPath || "لم يُحدد بعد"}</code>
            </div>
            <button className="btn btn-primary" onClick={() => setBrowsing(true)}>اختيار من متصفح الملفات</button>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            يمكنك تخطي هذه الخطوة وإضافة المصادر لاحقًا من لوحة الإدارة.
          </p>
        </div>
      )}
    </SetupStep>
  );
}
