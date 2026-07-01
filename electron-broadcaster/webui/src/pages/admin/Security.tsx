import { PageHeader } from "@/components/common";

export function AdminSecurity() {
  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader title="الأمان" subtitle="الدخول والجلسات وحماية اللوحة" />
      <div className="card card-pad">
        <div className="col">
          <div className="row-between">
            <div>
              <strong>جلسة المشرف</strong>
              <div className="tile-sub">تُدار الجلسات على الخادم وتنتهي تلقائيًا.</div>
            </div>
            <span className="badge badge-on badge-dot">نشطة</span>
          </div>
          <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />
          <div className="row-between">
            <div>
              <strong>تسجيل الخروج</strong>
              <div className="tile-sub">إنهاء الجلسة الحالية على هذا الجهاز.</div>
            </div>
            <a className="btn btn-danger btn-sm" href="/admin/logout">خروج</a>
          </div>
          <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />
          <div className="row-between">
            <div>
              <strong>مسار اللوحة المخصص</strong>
              <div className="tile-sub">يمكن تغيير مسار الإدارة من معالج الإعداد.</div>
            </div>
            <a className="btn btn-ghost btn-sm" href="/setup/ports">تعديل</a>
          </div>
        </div>
      </div>
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3>حماية الوصول</h3>
        <ul className="muted" style={{ lineHeight: 2 }}>
          <li>تقييد محاولات الدخول المتكررة مفعّل تلقائيًا.</li>
          <li>كلمات المرور مُخزّنة بشكل مُجزّأ (Hashed).</li>
          <li>اللوحة تعمل داخل الشبكة المحلية فقط.</li>
        </ul>
      </div>
    </div>
  );
}
