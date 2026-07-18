export default function AdminLoading() {
  return (
    <div className="admin-loading" role="status" aria-label="جارٍ تحميل لوحة الإدارة">
      <div className="skeleton admin-loading-title" />
      <div className="skeleton admin-loading-copy" />
      <div className="admin-loading-stats">
        {Array.from({ length: 4 }, (_, index) => <div className="skeleton" key={index} />)}
      </div>
      <div className="skeleton admin-loading-panel" />
      <span className="sr-only">جارٍ تحميل لوحة الإدارة…</span>
    </div>
  );
}
