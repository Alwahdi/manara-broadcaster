import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { ContentSection } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";

export function Account() {
  const { brand } = useBrand();
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });

  return (
    <div className="account-page">
      <section className="account-hero">
        <span className="badge">الملف الشخصي</span>
        <h1>حسابك على شبكة {brand}</h1>
        <p>معلومات بسيطة عن جلسة المشاهدة واختصارات تساعدك تصل للمحتوى بسرعة.</p>
      </section>
      <QueryBoundary query={state}>
        {(d) => {
          const account = (d.account || d.viewer) as
            | { name?: string; username?: string }
            | undefined;
          return (
            <div className="account-grid">
              <div className="account-card">
                <div className="account-avatar" aria-hidden>
                  {(account?.name || account?.username || brand || "W").slice(0, 1)}
                </div>
                <div>
                  <span>{account ? "متصل" : "ضيف"}</span>
                  <strong>{account?.name || account?.username || "مستخدم ضيف"}</strong>
                  <small>{brand}</small>
                </div>
              </div>
              <ContentSection title="اختصارات الحساب" subtitle="أشياء يحتاجها المشاهد بسرعة">
                <div className="settings-list">
                  <AppLink href="/favorites" className="settings-row">
                    <span>المفضلة</span>
                    <strong>عرض المحتوى المحفوظ</strong>
                  </AppLink>
                  <AppLink href="/search" className="settings-row">
                    <span>البحث</span>
                    <strong>ابحث في القنوات والاستراحة</strong>
                  </AppLink>
                  <AppLink href="/live" className="settings-row">
                    <span>جودة التشغيل</span>
                    <strong>تُدار من المشغل عند توفر أكثر من جودة</strong>
                  </AppLink>
                </div>
              </ContentSection>
              {account ? (
                null
              ) : (
                <div className="guest-note">
                  <strong>وضع الضيف</strong>
                  <p>يمكنك المشاهدة الآن. عند توفر حساب شخصي ستظهر هنا معلوماتك ومحتواك المحفوظ.</p>
                </div>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
