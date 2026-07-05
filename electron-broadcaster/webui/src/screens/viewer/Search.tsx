import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader, MediaTile } from "@/components/common";

export function Search() {
  const [term, setTerm] = useState("");
  const library = useQuery({ queryKey: ["library"], queryFn: () => api.library() });

  const results = useMemo(() => {
    const items = library.data?.items || [];
    const q = term.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      `${it.title || ""} ${it.name || ""} ${it.category || ""} ${it.folder || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [library.data, term]);

  return (
    <div>
      <PageHeader title="بحث" subtitle="ابحث في المكتبة بالاسم أو التصنيف" />
      <div className="field" style={{ maxWidth: 520 }}>
        <input
          className="input"
          placeholder="اكتب اسم فيلم أو تصنيف…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoFocus
        />
      </div>
      <QueryBoundary query={library} isEmpty={() => false}>
        {() =>
          results.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={term ? "لا نتائج" : "ابدأ البحث"}
              text={term ? "لم يتم العثور على وسائط مطابقة." : "اكتب كلمة للبحث في المكتبة."}
            />
          ) : (
            <div className="grid grid-auto">
              {results.map((item) => (
                <MediaTile key={item.id} item={item} />
              ))}
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}
