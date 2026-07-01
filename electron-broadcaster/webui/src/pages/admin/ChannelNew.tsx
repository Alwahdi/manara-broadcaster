import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api, type CaptureSource } from "@/lib/api";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

type SourceKind = "screen" | "window" | "device";

const KIND_LABEL: Record<SourceKind, string> = {
  screen: "شاشة كاملة",
  window: "نافذة تطبيق",
  device: "جهاز التقاط",
};

// Wizard steps in order. Bounds checks below derive from STEPS.length, so the
// wizard adapts automatically if steps are added or removed here.
const STEPS = ["نوع المصدر", "اختيار المصدر", "الصوت", "التسمية والتأكيد"];

/**
 * Adding a capture channel is done entirely through this wizard — the admin
 * never types a manual device id (acceptance criterion #1).
 */
export function AdminChannelNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [audio, setAudio] = useState<CaptureSource | null>(null);
  const [name, setName] = useState("");

  const devices = useQuery({
    queryKey: ["capture-devices"],
    queryFn: api.captureDevices,
    enabled: step >= 1,
  });

  const probe = useMutation({
    mutationFn: () =>
      api.captureProbe({ kind, sourceId: source?.id, audioId: audio?.id }),
  });

  const create = useMutation({
    mutationFn: () =>
      api.addChannel({
        name,
        kind: "capture",
        captureKind: kind,
        sourceId: source?.id,
        sourceName: source?.name,
        audioId: audio?.id || null,
        enabled: true,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-state"] });
      navigate({ to: "/admin/channels" });
    },
  });

  const sourceList: CaptureSource[] =
    kind === "screen"
      ? devices.data?.screens || []
      : kind === "window"
        ? devices.data?.windows || []
        : devices.data?.videoDevices || [];

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="قناة جديدة من جهاز التقاط" subtitle="أضف قناة بث بخطوات بسيطة دون كتابة أي معرف يدوي" />

      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <span key={label} className={`wizard-pill ${i === step ? "active" : i < step ? "done" : ""}`}>
            {i < step ? "✓ " : `${i + 1}. `}
            {label}
          </span>
        ))}
      </div>

      <div className="card card-pad">
        {step === 0 ? (
          <div>
            <h3>ما نوع المصدر الذي تريد بثّه؟</h3>
            <div className="grid grid-3" style={{ marginTop: 16 }}>
              {(Object.keys(KIND_LABEL) as SourceKind[]).map((k) => (
                <button
                  key={k}
                  className={`card card-pad card-hover ${kind === k ? "" : ""}`}
                  style={{
                    textAlign: "center",
                    borderColor: kind === k ? "var(--gold)" : undefined,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setKind(k);
                    setSource(null);
                  }}
                >
                  <div style={{ fontSize: "2rem" }} aria-hidden>
                    {k === "screen" ? "🖥️" : k === "window" ? "🪟" : "🎥"}
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 8 }}>{KIND_LABEL[k]}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <h3>اختر {kind ? KIND_LABEL[kind] : "المصدر"}</h3>
            {devices.isLoading ? (
              <LoadingState label="قراءة الأجهزة المتاحة…" />
            ) : devices.isError ? (
              <ErrorState error={devices.error} onRetry={() => devices.refetch()} />
            ) : sourceList.length === 0 ? (
              <EmptyState
                icon="🔌"
                title="لا مصادر متاحة"
                text={devices.data?.message || "لم يتم العثور على مصادر من هذا النوع. تأكد من توصيل الجهاز."}
                action={<button className="btn" onClick={() => devices.refetch()}>تحديث</button>}
              />
            ) : (
              <div className="grid grid-2" style={{ marginTop: 12 }}>
                {sourceList.map((s) => (
                  <button
                    key={s.id}
                    className="card card-pad card-hover"
                    style={{
                      textAlign: "start",
                      borderColor: source?.id === s.id ? "var(--gold)" : undefined,
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setSource(s);
                      if (!name) setName(s.name);
                    }}
                  >
                    <div className="row">
                      {s.thumbnail ? (
                        <img src={s.thumbnail} alt="" width={80} style={{ borderRadius: 8 }} />
                      ) : (
                        <span style={{ fontSize: "1.5rem" }}>🎬</span>
                      )}
                      <span className="truncate">{s.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h3>مصدر الصوت (اختياري)</h3>
            <div className="grid grid-2" style={{ marginTop: 12 }}>
              <button
                className="card card-pad card-hover"
                style={{ borderColor: audio === null ? "var(--gold)" : undefined, cursor: "pointer" }}
                onClick={() => setAudio(null)}
              >
                🔇 بدون صوت
              </button>
              {(devices.data?.audioDevices || []).map((a) => (
                <button
                  key={a.id}
                  className="card card-pad card-hover"
                  style={{ borderColor: audio?.id === a.id ? "var(--gold)" : undefined, cursor: "pointer", textAlign: "start" }}
                  onClick={() => setAudio(a)}
                >
                  🎙️ {a.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <div className="field">
              <label>اسم القناة</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: كاميرا القاعة" />
            </div>
            <div className="card card-pad" style={{ background: "var(--surface-2)" }}>
              <div className="row-between"><span className="muted">النوع</span><strong>{kind ? KIND_LABEL[kind] : "—"}</strong></div>
              <div className="row-between"><span className="muted">المصدر</span><strong>{source?.name || "—"}</strong></div>
              <div className="row-between"><span className="muted">الصوت</span><strong>{audio?.name || "بدون"}</strong></div>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => probe.mutate()} disabled={probe.isPending || !source}>
                {probe.isPending ? "جارٍ الفحص…" : "فحص المصدر"}
              </button>
              {probe.isSuccess ? <span className="badge badge-on badge-dot">جاهز للبث</span> : null}
              {probe.isError ? <span className="badge badge-warn">{(probe.error as Error).message}</span> : null}
            </div>
            {create.isError ? <p style={{ color: "var(--danger)" }}>{(create.error as Error).message}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="row-between" style={{ marginTop: 20 }}>
        <button className="btn btn-ghost" onClick={back} disabled={step === 0}>السابق</button>
        {step < STEPS.length - 1 ? (
          <button
            className="btn btn-primary"
            onClick={next}
            disabled={(step === 0 && !kind) || (step === 1 && !source)}
          >
            التالي
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => create.mutate()} disabled={!name || !source || create.isPending}>
            {create.isPending ? "جارٍ الإنشاء…" : "إنشاء القناة"}
          </button>
        )}
      </div>
    </div>
  );
}
