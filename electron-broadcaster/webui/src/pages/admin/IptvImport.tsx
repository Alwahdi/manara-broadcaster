import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api, type Channel } from "@/lib/api";
import { PageHeader } from "@/components/common";

/** Two-phase IPTV import: preview then commit selected channels. */
export function AdminIptvImport() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const preview = useMutation({
    mutationFn: () => api.iptvImportPreview(mode === "url" ? { url } : { content: text }),
    onSuccess: (data) => setSelected(new Set((data.channels || []).map((c) => String(c.id ?? c.name)))),
  });

  const commit = useMutation({
    mutationFn: () => {
      const channels = (preview.data?.channels || []).filter((c) =>
        selected.has(String(c.id ?? c.name)),
      );
      return api.iptvImportCommit({ channels });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-state"] });
      navigate({ to: "/admin/iptv" });
    },
  });

  const channels = preview.data?.channels || [];

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="استيراد IPTV" subtitle="عاين القنوات قبل إضافتها، واختر ما تريد فقط" />

      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 14 }}>
          <button className={`btn btn-sm ${mode === "url" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("url")}>رابط M3U</button>
          <button className={`btn btn-sm ${mode === "text" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("text")}>لصق المحتوى</button>
        </div>
        {mode === "url" ? (
          <div className="field">
            <label>رابط قائمة M3U</label>
            <input className="input mono" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://…/playlist.m3u" />
          </div>
        ) : (
          <div className="field">
            <label>محتوى M3U</label>
            <textarea className="textarea mono" dir="ltr" value={text} onChange={(e) => setText(e.target.value)} placeholder="#EXTM3U…" />
          </div>
        )}
        <button className="btn btn-primary" onClick={() => preview.mutate()} disabled={preview.isPending || (mode === "url" ? !url : !text)}>
          {preview.isPending ? "جارٍ التحليل…" : "معاينة القنوات"}
        </button>
        {preview.isError ? <p style={{ color: "var(--danger)" }}>{(preview.error as Error).message}</p> : null}
      </div>

      {preview.isSuccess ? (
        channels.length === 0 ? (
          <div className="state" style={{ marginTop: 20 }}>
            <div className="state-icon">📭</div>
            <div className="state-title">لم يتم العثور على قنوات</div>
            <p className="state-text">تأكد من صحة الرابط أو المحتوى.</p>
          </div>
        ) : (
          <div className="card card-pad" style={{ marginTop: 20 }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <strong>{channels.length} قناة — محدد {selected.size}</strong>
              <button className="btn btn-primary" onClick={() => commit.mutate()} disabled={commit.isPending || selected.size === 0}>
                {commit.isPending ? "جارٍ الإضافة…" : `إضافة ${selected.size}`}
              </button>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {channels.map((ch: Channel) => {
                const key = String(ch.id ?? ch.name);
                return (
                  <label key={key} className="explorer-item" style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                    <span className="grow truncate">{ch.name}</span>
                    {ch.group ? <span className="badge">{ch.group}</span> : null}
                  </label>
                );
              })}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
