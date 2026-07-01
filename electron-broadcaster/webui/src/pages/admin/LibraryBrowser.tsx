import { useState } from "react";
import { PageHeader } from "@/components/common";
import { StorageBrowser } from "@/components/StorageBrowser";

export function AdminLibraryBrowser() {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div>
      <PageHeader
        title="متصفح الملفات"
        subtitle="تصفّح الأقراص والمجلدات كما في مستكشف الملفات"
      />
      {picked ? (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row-between">
            <div>
              <div className="muted">المجلد المحدد</div>
              <code className="mono">{picked}</code>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setPicked(null)}>مسح</button>
          </div>
        </div>
      ) : null}
      <StorageBrowser selectLabel="تحديد هذا المجلد" onSelect={setPicked} />
    </div>
  );
}
