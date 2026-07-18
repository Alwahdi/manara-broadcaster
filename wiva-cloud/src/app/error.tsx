"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="auth-panel" style={{ minHeight: "100vh" }}><div className="auth-card"><h2>حدث خطأ غير متوقع</h2><p>جرّب تحديث الصفحة. لم يتم كشف أي تفاصيل داخلية.</p><button className="button primary wide" onClick={reset}>إعادة المحاولة</button></div></main>; }
