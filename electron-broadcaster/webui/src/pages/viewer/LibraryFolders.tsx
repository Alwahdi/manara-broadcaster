import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type MediaItem } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { PageHeader, MediaTile } from "@/components/common";

/** File-Explorer-style folder view of the library. */
export function LibraryFolders() {
  const library = useQuery({ queryKey: ["library"], queryFn: () => api.library() });
  const [folder, setFolder] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title="مجلدات المكتبة" subtitle="تصفّح الوسائط كما في مستكشف الملفات" />
      <QueryBoundary
        query={library}
        isEmpty={(d) => !d.items || d.items.length === 0}
        empty={<EmptyState icon="📂" title="لا مجلدات" text="لا توجد وسائط لعرضها في المجلدات." />}
      >
        {(data) => <FolderExplorer items={data.items} folder={folder} setFolder={setFolder} />}
      </QueryBoundary>
    </div>
  );
}

function FolderExplorer({
  items,
  folder,
  setFolder,
}: {
  items: MediaItem[];
  folder: string | null;
  setFolder: (f: string | null) => void;
}) {
  const folders = useMemo(() => {
    const set = new Map<string, number>();
    for (const it of items) {
      const key = it.folder || it.category || "غير مصنّف";
      set.set(key, (set.get(key) || 0) + 1);
    }
    return Array.from(set.entries());
  }, [items]);

  const visible = folder
    ? items.filter((it) => (it.folder || it.category || "غير مصنّف") === folder)
    : [];

  return (
    <div className="explorer">
      <div className="card card-pad">
        <div className="side-group-label" style={{ paddingTop: 0 }}>المجلدات</div>
        <div className="explorer-list">
          {folders.map(([name, count]) => (
            <div
              key={name}
              className={`explorer-item ${folder === name ? "active" : ""}`}
              onClick={() => setFolder(name)}
            >
              <span aria-hidden>📁</span>
              <span className="grow truncate">{name}</span>
              <span className="badge">{count}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        {!folder ? (
          <EmptyState icon="🗂️" title="اختر مجلدًا" text="حدد مجلدًا من القائمة لعرض محتوياته." />
        ) : visible.length === 0 ? (
          <EmptyState icon="📂" title="المجلد فارغ" />
        ) : (
          <div className="grid grid-auto">
            {visible.map((item) => (
              <MediaTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
