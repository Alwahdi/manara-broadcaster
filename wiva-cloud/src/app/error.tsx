"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="auth-panel state-page"><div className="auth-card"><span className="state-symbol" aria-hidden="true">!</span><h2>تعذر إكمال الطلب</h2><p>تحقق من اتصالك ثم أعد المحاولة.</p><button className="button primary wide" onClick={reset}>إعادة المحاولة</button></div></main>; }
