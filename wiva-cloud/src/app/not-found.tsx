import Link from "next/link";
export default function NotFound() { return <main className="auth-panel" style={{ minHeight: "100vh" }}><div className="auth-card"><h2>الصفحة غير موجودة</h2><p>الرابط غير صحيح أو أن المحتوى لم يعد متاحًا.</p><Link className="button primary wide" href="/">العودة للرئيسية</Link></div></main>; }
