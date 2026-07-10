import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppNavigate } from "@/components/AppLink";
import { api, type CaptureSource } from "@/lib/api";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { PageHeader } from "@/components/common";

type SourceKind = "screen" | "window" | "device";

const KIND_LABEL: Record<SourceKind, string> = {
  screen: "شاشة كاملة",
  window: "نافذة تطبيق",
  device: "جهاز التقاط",
};
const KIND_HELP: Record<SourceKind, string> = {
  screen: "أفضل خيار لبث شاشة السيرفر كاملة بوضوح عالي.",
  window: "اختر نافذة محددة عندما تريد بث تطبيق واحد فقط.",
  device: "كاميرا، كرت التقاط، أو USB Video مع صوت اختياري.",
};

// Wizard steps in order. Bounds checks below derive from STEPS.length, so the
// wizard adapts automatically if steps are added or removed here.
const STEPS = ["نوع المصدر", "اختيار المصدر", "الصوت", "التسمية والتأكيد"];

/**
 * Adding a capture channel is done entirely through this wizard — the admin
 * never types a manual device id (acceptance criterion #1).
 */
export function AdminChannelNew() {
  const navigate = useAppNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [audio, setAudio] = useState<CaptureSource | null>(null);
  const [name, setName] = useState("");
  const [resolution, setResolution] = useState("1920x1080");
  const [fps, setFps] = useState("30");
  const [bitrateKbps, setBitrateKbps] = useState("8000");
  const [audioBitrateKbps, setAudioBitrateKbps] = useState("256");
  const [audioMode, setAudioMode] = useState("direct");
  const [audioGain, setAudioGain] = useState("1");

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
        source: {
          type: kind,
          id: source?.id,
          name: source?.name,
          matchName: source?.name,
          deviceKey: (source as CaptureSource & { deviceKey?: string })?.deviceKey || source?.id,
        },
        sourceId: source?.id,
        sourceName: source?.name,
        audioId: audio?.id || null,
        audioName: audio?.name || "",
        audioDeviceMatchName: audio?.name || "",
        resolution,
        fps: Number(fps) || 30,
        bitrateKbps: Number(bitrateKbps) || 8000,
        audioBitrateKbps: Number(audioBitrateKbps) || 256,
        audioMode,
        audioGain: Number(audioGain) || 1,
        enabled: true,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-state"] });
      navigate("/admin/channels");
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

  const selectedPreview = source?.thumbnail || "";
  const canContinue = (step === 0 && !!kind) || (step === 1 && !!source) || step >= 2;

  return (
    <div className="admin-wide">
      <PageHeader
        title="قناة جديدة من جهاز التقاط"
        subtitle="اختر المصدر والصوت وجودة البث من واجهة واضحة ومناسبة للجوال والكمبيوتر."
      />

      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <span key={label} className={`wizard-pill ${i === step ? "active" : i < step ? "done" : ""}`}>
            {i < step ? "✓ " : `${i + 1}. `}
            {label}
          </span>
        ))}
      </div>

      <div className="capture-wizard">
        <aside className="capture-preview card">
          <div className="capture-preview-screen">
            {selectedPreview ? (
              <img src={selectedPreview} alt="" />
            ) : (
              <div className="capture-preview-empty">
                <span aria-hidden>{kind === "screen" ? "🖥️" : kind === "window" ? "🪟" : "🎥"}</span>
                <strong>{source?.name || "اختر مصدر البث"}</strong>
                <small>ستظهر المعاينة هنا عند اختيار شاشة أو نافذة متاحة.</small>
              </div>
            )}
          </div>
          <div className="capture-preview-body">
            <div>
              <span className="badge badge-dot badge-on">جودة عالية</span>
              <h3>{source?.name || (kind ? KIND_LABEL[kind] : "مصدر البث")}</h3>
              <p className="muted">{kind ? KIND_HELP[kind] : "ابدأ باختيار نوع المصدر، ثم اختر الجهاز أو الشاشة."}</p>
            </div>
            <div className="capture-spec-grid">
              <div><span>الدقة</span><strong dir="ltr">{resolution}</strong></div>
              <div><span>الإطارات</span><strong dir="ltr">{fps} fps</strong></div>
              <div><span>المعدل</span><strong dir="ltr">{bitrateKbps} kbps</strong></div>
              <div><span>الصوت</span><strong>{audio?.name || "بدون"}</strong></div>
              <div><span>معالجة الصوت</span><strong>{audioMode === "voice" ? "وضوح الكلام" : audioMode === "direct" ? "مباشر" : "متوازن"}</strong></div>
            </div>
          </div>
        </aside>

        <section className="card card-pad capture-panel">
          {step === 0 ? (
            <div>
              <h3>ما نوع المصدر الذي تريد بثّه؟</h3>
              <div className="capture-choice-grid" style={{ marginTop: 16 }}>
                {(Object.keys(KIND_LABEL) as SourceKind[]).map((k) => (
                  <button
                    key={k}
                    className={`capture-choice ${kind === k ? "active" : ""}`}
                    onClick={() => {
                      setKind(k);
                      setSource(null);
                      if (!name) setName(KIND_LABEL[k]);
                    }}
                  >
                    <span className="capture-choice-icon" aria-hidden>
                      {k === "screen" ? "🖥️" : k === "window" ? "🪟" : "🎥"}
                    </span>
                    <strong>{KIND_LABEL[k]}</strong>
                    <small>{KIND_HELP[k]}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <div className="row-between">
                <h3>اختر {kind ? KIND_LABEL[kind] : "المصدر"}</h3>
                <button className="btn btn-sm btn-ghost" onClick={() => devices.refetch()} disabled={devices.isFetching}>
                  {devices.isFetching ? "جارٍ التحديث…" : "تحديث القائمة"}
                </button>
              </div>
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
                <div className="capture-source-grid" style={{ marginTop: 12 }}>
                  {sourceList.map((s) => (
                    <button
                      key={s.id}
                      className={`capture-source-card ${source?.id === s.id ? "active" : ""}`}
                      onClick={() => {
                        setSource(s);
                        if (!name || Object.values(KIND_LABEL).includes(name)) setName(s.name);
                      }}
                    >
                      <div className="capture-source-thumb">
                        {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <span aria-hidden>🎬</span>}
                      </div>
                      <div className="capture-source-body">
                        <strong>{s.name}</strong>
                        <small className="mono" dir="ltr">{s.id}</small>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h3>الصوت وجودة البث</h3>
              <p className="muted">هذه الإعدادات تحفظ مع القناة، ويمكن تعديلها لاحقًا من صفحة القنوات.</p>
              <div className="grid grid-3" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>الدقة</label>
                  <select className="select mono" dir="ltr" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                    <option value="1920x1080">1920x1080 Full HD</option>
                    <option value="1280x720">1280x720 HD</option>
                    <option value="854x480">854x480 SD</option>
                  </select>
                </div>
                <div className="field">
                  <label>الإطارات</label>
                  <select className="select mono" dir="ltr" value={fps} onChange={(e) => setFps(e.target.value)}>
                    <option value="30">30 fps</option>
                    <option value="25">25 fps</option>
                    <option value="60">60 fps</option>
                  </select>
                </div>
                <div className="field">
                  <label>معدل البث</label>
                  <select className="select mono" dir="ltr" value={bitrateKbps} onChange={(e) => setBitrateKbps(e.target.value)}>
                    <option value="8000">8000 kbps</option>
                    <option value="6000">6000 kbps</option>
                    <option value="4500">4500 kbps</option>
                    <option value="2500">2500 kbps</option>
                  </select>
                </div>
                <div className="field">
                  <label>جودة الصوت</label>
                  <select className="select mono" dir="ltr" value={audioBitrateKbps} onChange={(e) => setAudioBitrateKbps(e.target.value)}>
                    <option value="256">256 kbps</option>
                    <option value="320">320 kbps</option>
                    <option value="192">192 kbps</option>
                    <option value="128">128 kbps</option>
                  </select>
                </div>
                <div className="field">
                  <label>وضع الصوت</label>
                  <select className="select" value={audioMode} onChange={(e) => setAudioMode(e.target.value)}>
                    <option value="direct">مباشر من الجهاز</option>
                    <option value="cinema">متوازن وواضح</option>
                    <option value="voice">وضوح الكلام</option>
                  </select>
                </div>
                <div className="field">
                  <label>رفع الصوت</label>
                  <select className="select mono" dir="ltr" value={audioGain} onChange={(e) => setAudioGain(e.target.value)}>
                    <option value="1">1.00x</option>
                    <option value="1.05">1.05x</option>
                    <option value="1.15">1.15x</option>
                    <option value="1.3">1.30x</option>
                  </select>
                </div>
              </div>
              <div className="capture-audio-grid" style={{ marginTop: 12 }}>
                <button
                  className={`capture-audio-card ${audio === null ? "active" : ""}`}
                  onClick={() => setAudio(null)}
                >
                  <span aria-hidden>🔇</span>
                  <strong>بدون صوت</strong>
                </button>
                {(devices.data?.audioDevices || []).map((a) => (
                  <button
                    key={a.id}
                    className={`capture-audio-card ${audio?.id === a.id ? "active" : ""}`}
                    onClick={() => setAudio(a)}
                  >
                    <span aria-hidden>🎙️</span>
                    <strong>{a.name}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <h3>التسمية والتأكيد</h3>
              <div className="field" style={{ marginTop: 14 }}>
                <label>اسم القناة</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: كاميرا القاعة" />
              </div>
              <div className="summary-grid">
                <div><span>النوع</span><strong>{kind ? KIND_LABEL[kind] : "—"}</strong></div>
                <div><span>المصدر</span><strong>{source?.name || "—"}</strong></div>
                <div><span>الصوت</span><strong>{audio?.name || "بدون"}</strong></div>
                <div><span>الجودة</span><strong dir="ltr">{resolution} · {fps}fps</strong></div>
                <div><span>معالجة الصوت</span><strong>{audioMode === "voice" ? "وضوح الكلام" : audioMode === "direct" ? "مباشر" : "متوازن وواضح"}</strong></div>
                <div><span>ترميز الصوت</span><strong dir="ltr">{audioBitrateKbps} kbps · {audioGain}x</strong></div>
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

          <div className="capture-actions">
            <button className="btn btn-ghost" onClick={back} disabled={step === 0}>السابق</button>
            {step < STEPS.length - 1 ? (
              <button
                className="btn btn-primary"
                onClick={next}
                disabled={!canContinue}
              >
                التالي
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => create.mutate()} disabled={!name || !source || create.isPending}>
                {create.isPending ? "جارٍ الإنشاء…" : "إنشاء القناة"}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
