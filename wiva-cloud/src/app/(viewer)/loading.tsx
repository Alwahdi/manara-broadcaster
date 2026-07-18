export default function ViewerLoading() {
  return (
    <main className="route-loading container" aria-live="polite" aria-busy="true">
      <span className="sr-only">جارٍ تحميل الصفحة</span>
      <div className="loading-heading skeleton" />
      <div className="loading-copy skeleton" />
      <div className="loading-search skeleton" />
      <div className="loading-grid">
        {Array.from({ length: 8 }, (_, index) => <div className="loading-card" key={index}><div className="loading-art skeleton" /><div className="loading-line skeleton" /><div className="loading-line short skeleton" /></div>)}
      </div>
    </main>
  );
}
