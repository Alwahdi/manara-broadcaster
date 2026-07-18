import Link from "next/link";
export default function NotFound() { return <main className="auth-panel state-page"><div className="auth-card"><span className="state-symbol" aria-hidden="true">404</span><h2>الصفحة غير موجودة</h2><p>الرابط غير صحيح أو أن المحتوى لم يعد متاحًا.</p><Link className="button primary wide" href="/">العودة للرئيسية</Link></div></main>; }
