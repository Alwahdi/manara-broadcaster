import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";

export function Account() {
  const { brand } = useBrand();
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });

  return (
    <div>
      <PageHeader title="حسابي" subtitle="معلومات حسابك على الشبكة" />
      <QueryBoundary query={state}>
        {(d) => {
          const account = (d.account || d.viewer) as
            | { name?: string; username?: string }
            | undefined;
          return (
            <div className="card card-pad" style={{ maxWidth: 520 }}>
              {account ? (
                <div className="col">
                  <div className="row-between">
                    <span className="muted">الاسم</span>
                    <strong>{account.name || account.username || "مستخدم"}</strong>
                  </div>
                  <div className="row-between">
                    <span className="muted">الشبكة</span>
                    <strong>{brand}</strong>
                  </div>
                </div>
              ) : (
                <div className="col" style={{ alignItems: "flex-start" }}>
                  <p className="muted">أنت تتصفّح كضيف على شبكة {brand}.</p>
                  <span className="badge">وضع الضيف</span>
                </div>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
