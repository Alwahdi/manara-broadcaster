import { SetupStep } from "@/components/SetupStep";
import { useBrand } from "@/hooks/useBrand";

export function SetupWelcome() {
  const { brand } = useBrand();
  return (
    <SetupStep
      title="مرحبًا بك"
      subtitle="لنقم بإعداد شبكتك المحلية للبث والمكتبة في خطوات قليلة."
      next="/setup/network"
      nextLabel="لنبدأ"
    >
      <div className="card card-pad">
        <p className="muted" style={{ marginTop: 0 }}>
          سيساعدك هذا المعالج على ضبط اسم الشبكة، وحساب المشرف، والهوية، والمنافذ، والمكتبة، وقنوات IPTV.
          كل شيء يعمل داخل الشبكة المحلية دون الحاجة إلى إنترنت.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="badge">📡 بث محلي</span>
          <span className="badge">🎬 مكتبة وسائط</span>
          <span className="badge">🛰️ IPTV</span>
          <span className="badge">📱 جوال وتلفاز</span>
        </div>
        <p className="hint" style={{ marginTop: 16 }}>الشبكة الحالية: {brand}</p>
      </div>
    </SetupStep>
  );
}
