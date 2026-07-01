import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  Clock3,
  Clapperboard,
  Folder,
  Grid2X2,
  HardDrive,
  Heart,
  Home,
  ImageIcon,
  LayoutList,
  MessageCircle,
  Music2,
  Play,
  Radio,
  Search,
  Sparkles,
  Star,
  UserCircle2,
  Video,
} from "lucide-react";
import { fetchCategories } from "@/lib/categories";
import { fetchRecentMedia, fetchMediaByCategory, type Media } from "@/lib/media";
import { fetchAllPaths, type LibPath } from "@/lib/paths";
import { AuroraBackground } from "@/components/AuroraBackground";
import { PRODUCT, pageTitle } from "@/lib/product";
import heroLibrary from "../../electron-broadcaster/assets/library/hero-library.png";
import sourceArt from "../../electron-broadcaster/assets/library/source.png";
import folderArt from "../../electron-broadcaster/assets/library/folder.png";
import videoArt from "../../electron-broadcaster/assets/library/video.png";
import audioArt from "../../electron-broadcaster/assets/library/audio.png";
import imageArt from "../../electron-broadcaster/assets/library/image.png";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: pageTitle(PRODUCT.libraryName) },
      { name: "description", content: "تصفح مكتبة ويفا للأفلام والوسائط داخل الشبكة المحلية." },
    ],
  }),
});

type FolderNode = {
  id: string;
  name: string;
  subtitle: string;
  count: number;
  kind: "source" | "category" | "virtual";
  thumbnail: string;
  icon: typeof Folder;
};

function LibraryPage() {
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const { data: cats = [] } = useQuery({ queryKey: ["public-cats"], queryFn: fetchCategories });
  const { data: paths = [] } = useQuery({ queryKey: ["public-paths"], queryFn: fetchAllPaths });
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["public-media", activeCat],
    queryFn: () => activeCat ? fetchMediaByCategory(activeCat, 160) : fetchRecentMedia(220),
  });

  const folders = useMemo(() => buildFolders(paths, cats, items), [paths, cats, items]);
  const selectedFolder = folders.find((f) => f.id === activeFolder) ?? null;
  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return items
      .filter((m) => !selectedFolder || matchesFolder(m, selectedFolder))
      .filter((m) => text ? [m.title, m.overview, m.year].join(" ").toLowerCase().includes(text) : true);
  }, [items, q, selectedFolder]);
  const hero = filtered[0] ?? items[0];
  const recent = filtered.slice(0, 12);
  const more = filtered.slice(12);

  return (
    <div dir="rtl" className="wiva-shell">
      <AuroraBackground />
      <header className="wiva-topbar">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/library" className="flex items-center gap-2 rounded-2xl px-2 py-1 font-extrabold text-primary">
            <img src="/wiva-logo.png" alt="" className="h-9 w-auto max-w-[92px] object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <span>{PRODUCT.libraryName}</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 lg:flex">
            <button className="wiva-chip wiva-chip-active" type="button"><Home className="h-4 w-4" /> الرئيسية</button>
            <a href="/" className="wiva-chip"><Radio className="h-4 w-4" /> البث المباشر</a>
            <button className="wiva-chip" type="button"><Heart className="h-4 w-4" /> المفضلة</button>
            <button className="wiva-chip" type="button"><Clock3 className="h-4 w-4" /> متابعة</button>
          </nav>
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input-base min-h-11 w-full rounded-2xl pr-9"
              placeholder="ابحث داخل الاستراحة..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button className="btn-ghost hidden min-h-11 items-center gap-2 rounded-2xl px-3 md:inline-flex" type="button">
            <MessageCircle className="h-4 w-4" /> رسالة
          </button>
          <button className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-2xl px-3" type="button" aria-label="حساب المشاهد">
            <UserCircle2 className="h-5 w-5" />
          </button>
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
          <button onClick={() => { setActiveCat(null); setActiveFolder(null); }} className={`wiva-chip ${!activeCat && !activeFolder ? "wiva-chip-active" : ""}`}>كل الاستراحة</button>
          {cats.map((c) => (
            <button key={c.id} onClick={() => { setActiveCat(c.id); setActiveFolder(null); }} className={`wiva-chip ${activeCat === c.id ? "wiva-chip-active" : ""}`}>{c.name}</button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 pb-24 sm:px-6">
        {isLoading ? (
          <LibrarySkeleton />
        ) : items.length === 0 ? (
          <EmptyLibrary query={q} />
        ) : (
          <>
            <section className="wiva-hero min-h-[430px] p-6 sm:p-8 lg:p-10">
              <img src={hero?.posterUrl || hero?.thumbnailUrl || heroLibrary} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
              <div className="absolute inset-0 bg-gradient-to-l from-background via-background/80 to-background/30" />
              <div className="relative z-10 grid min-h-[350px] items-end gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="max-w-3xl">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-extrabold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    {selectedFolder ? selectedFolder.name : "استراحة ويفا"}
                  </div>
                  <h1 className="max-w-3xl text-3xl font-black leading-tight sm:text-5xl">
                    {selectedFolder ? "تصفح المحتوى بنفس ترتيب المجلدات" : "مكتبة شبكتك بشكل أنيق وسريع"}
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-8 text-muted-foreground sm:text-base">
                    {selectedFolder
                      ? "افتح المجلد، اختر الملف، وابدأ المشاهدة مباشرة داخل الشبكة المحلية."
                      : "مصادر، مجلدات، أفلام، مسلسلات وصوتيات في واجهة عربية واضحة تناسب التلفزيون والجوال."}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {hero ? (
                      <Link to="/watch/$id" params={{ id: hero.id }} className="btn-primary inline-flex min-h-12 items-center gap-2 rounded-2xl px-5">
                        <Play className="h-4 w-4" fill="currentColor" /> تشغيل مقترح
                      </Link>
                    ) : null}
                    <a href="#folders" className="btn-ghost inline-flex min-h-12 items-center gap-2 rounded-2xl px-5">
                      <Folder className="h-4 w-4" /> فتح المجلدات
                    </a>
                  </div>
                </div>
                <HeroPreview folders={folders} items={items} />
              </div>
            </section>

            <section id="folders" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="inline-flex items-center gap-2 text-2xl font-black">
                    <Folder className="h-6 w-6 text-primary" /> المجلدات والمصادر
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">عرض قريب من الكمبيوتر: مصادر ومجلدات أولاً، ثم الملفات.</p>
                </div>
                {selectedFolder ? (
                  <button className="btn-ghost inline-flex items-center gap-2 rounded-2xl" onClick={() => setActiveFolder(null)} type="button">
                    <ChevronLeft className="h-4 w-4" /> الرجوع لكل المجلدات
                  </button>
                ) : null}
              </div>
              {!selectedFolder ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {folders.map((folder) => (
                    <FolderCard key={folder.id} folder={folder} onOpen={() => setActiveFolder(folder.id)} />
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
                        <selectedFolder.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-black">{selectedFolder.name}</h3>
                        <p className="text-xs text-muted-foreground">{selectedFolder.count} عنصر داخل هذا المجلد</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className={`wiva-chip ${view === "grid" ? "wiva-chip-active" : ""}`} onClick={() => setView("grid")} type="button"><Grid2X2 className="h-4 w-4" /> شبكة</button>
                      <button className={`wiva-chip ${view === "list" ? "wiva-chip-active" : ""}`} onClick={() => setView("list")} type="button"><LayoutList className="h-4 w-4" /> قائمة</button>
                    </div>
                  </div>
                  <MediaGrid items={filtered} view={view} />
                </div>
              )}
            </section>

            {!selectedFolder ? (
              <>
                <ContentRow title="المضاف حديثًا" icon={Clock3} items={recent} />
                <ContentRow title="اقتراحات للمشاهدة" icon={Star} items={more.length ? more : recent.slice(0, 8)} />
              </>
            ) : null}
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/85 px-4 py-2 backdrop-blur-2xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1 text-center text-[11px] font-bold text-muted-foreground">
          <Link to="/library" className="rounded-xl p-2 text-primary"><Folder className="mx-auto mb-1 h-5 w-5" />الاستراحة</Link>
          <a href="/" className="rounded-xl p-2"><Radio className="mx-auto mb-1 h-5 w-5" />البث</a>
          <button className="rounded-xl p-2" type="button"><Heart className="mx-auto mb-1 h-5 w-5" />المفضلة</button>
          <button className="rounded-xl p-2" type="button"><UserCircle2 className="mx-auto mb-1 h-5 w-5" />حسابي</button>
        </div>
      </nav>
    </div>
  );
}

function buildFolders(paths: LibPath[], cats: Awaited<ReturnType<typeof fetchCategories>>, items: Media[]): FolderNode[] {
  const activePaths = paths.filter((p) => p.isActive);
  const sourceFolders = activePaths.map((p) => ({
    id: `path:${p.id}`,
    name: p.name || "مكتبة",
    subtitle: p.path || "مصدر وسائط",
    count: items.filter((m) => m.pathId === p.id).length,
    kind: "source" as const,
    thumbnail: p.thumbnail || items.find((m) => m.pathId === p.id)?.posterUrl || items.find((m) => m.pathId === p.id)?.thumbnailUrl || sourceArt,
    icon: HardDrive,
  }));
  const categoryFolders = cats.map((c) => ({
    id: `cat:${c.id}`,
    name: c.name,
    subtitle: "تصنيف",
    count: items.filter((m) => m.categoryId === c.id).length,
    kind: "category" as const,
    thumbnail: items.find((m) => m.categoryId === c.id)?.posterUrl || items.find((m) => m.categoryId === c.id)?.thumbnailUrl || folderArt,
    icon: Folder,
  }));
  const fallback = [
    { id: "kind:movie", name: "الأفلام", subtitle: "كل الأفلام", count: items.filter((m) => m.kind === "movie").length, kind: "virtual" as const, thumbnail: videoArt, icon: Clapperboard },
    { id: "kind:episode", name: "المسلسلات", subtitle: "الحلقات والمواسم", count: items.filter((m) => m.kind === "episode").length, kind: "virtual" as const, thumbnail: videoArt, icon: Video },
    { id: "kind:audio", name: "الصوتيات", subtitle: "الملفات الصوتية", count: items.filter((m) => m.kind === "audio").length, kind: "virtual" as const, thumbnail: audioArt, icon: Music2 },
  ].filter((f) => f.count > 0);
  return [...sourceFolders, ...categoryFolders, ...fallback].filter((f) => f.count > 0 || f.kind === "source");
}

function matchesFolder(item: Media, folder: FolderNode) {
  if (folder.id.startsWith("path:")) return item.pathId === folder.id.slice(5);
  if (folder.id.startsWith("cat:")) return item.categoryId === folder.id.slice(4);
  if (folder.id.startsWith("kind:")) return item.kind === folder.id.slice(5);
  return true;
}

function HeroPreview({ folders, items }: { folders: FolderNode[]; items: Media[] }) {
  return (
    <div className="hidden rounded-3xl border border-white/10 bg-black/25 p-4 shadow-elegant backdrop-blur-xl lg:block">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-black">نظرة سريعة</span>
        <span className="text-xs font-bold text-muted-foreground">{items.length} عنصر</span>
      </div>
      <div className="grid gap-3">
        {folders.slice(0, 4).map((folder) => (
          <div key={folder.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary/15 text-primary">
              {folder.thumbnail ? <img src={folder.thumbnail} alt="" className="h-full w-full object-cover" /> : <folder.icon className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold">{folder.name}</div>
              <div className="truncate text-xs text-muted-foreground">{folder.count} عنصر</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FolderCard({ folder, onOpen }: { folder: FolderNode; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group min-h-[158px] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] p-0 text-right shadow-elegant transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-glow" type="button">
      <div className="relative flex h-full min-h-[158px] flex-col justify-between p-4">
        <img src={folder.thumbnail || folderArt} alt="" className="absolute inset-0 h-full w-full object-cover opacity-28 transition group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/72 to-background/25" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/25 bg-primary/15 text-primary">
            <folder.icon className="h-7 w-7" />
          </div>
          <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-black text-white">{folder.count} عنصر</span>
        </div>
        <div className="relative">
          <h3 className="line-clamp-1 text-lg font-black">{folder.name}</h3>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-muted-foreground">{folder.subtitle}</p>
        </div>
      </div>
    </button>
  );
}

function ContentRow({ title, icon: Icon, items }: { title: string; icon: typeof Clock3; items: Media[] }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-xl font-black">
          <Icon className="h-5 w-5 text-primary" /> {title}
        </h2>
        <span className="text-xs font-bold text-muted-foreground">{items.length} عنصر</span>
      </div>
      <MediaGrid items={items} view="grid" />
    </section>
  );
}

function MediaGrid({ items, view }: { items: Media[]; view: "grid" | "list" }) {
  if (!items.length) {
    return <div className="wiva-empty min-h-[180px]">لا توجد عناصر داخل هذا المجلد حالياً.</div>;
  }
  return (
    <div className={view === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" : "grid gap-2"}>
      {items.map((m) => view === "grid" ? <Poster key={m.id} item={m} /> : <MediaListItem key={m.id} item={m} />)}
    </div>
  );
}

function Poster({ item }: { item: Media }) {
  return (
    <Link to="/watch/$id" params={{ id: item.id }} className="wiva-poster-card group">
      <div className="wiva-poster-frame aspect-[2/3]">
        {item.posterUrl || item.thumbnailUrl ? (
          <img src={item.posterUrl || item.thumbnailUrl || ""} alt={item.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <img src={mediaFallbackArt(item)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3">
          <div className="line-clamp-2 min-h-[2.2rem] text-sm font-extrabold">{item.title}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-white/70">
            {item.year && <span>{item.year}</span>}
            {item.durationSeconds ? <span>{formatDuration(item.durationSeconds)}</span> : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function MediaListItem({ item }: { item: Media }) {
  return (
    <Link to="/watch/$id" params={{ id: item.id }} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 transition hover:border-primary/45 hover:bg-white/[0.075]">
      <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10">
        <img src={item.thumbnailUrl || item.posterUrl || mediaFallbackArt(item)} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-black">{item.title}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{[kindText(item.kind), item.year, formatDuration(item.durationSeconds)].filter(Boolean).join(" · ")}</div>
      </div>
      <Play className="h-4 w-4 text-primary" />
    </Link>
  );
}

function FallbackIcon({ item, large = false }: { item: Media; large?: boolean }) {
  const Icon = item.kind === "audio" ? Music2 : item.kind === "image" ? ImageIcon : Video;
  return (
    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-white/10 to-white/5 text-primary">
      <Icon className={large ? "h-12 w-12" : "h-6 w-6"} />
    </div>
  );
}

function mediaFallbackArt(item: Media) {
  if (item.kind === "audio") return audioArt;
  if (item.kind === "image") return imageArt;
  return videoArt;
}

function EmptyLibrary({ query }: { query: string }) {
  return (
    <div className="wiva-empty">
      <div>
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary/15 text-primary"><Folder className="h-8 w-8" /></div>
        <h2 className="text-2xl font-black">{query ? "لم نعثر على نتائج مطابقة" : "الاستراحة جاهزة للإضافة"}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
          {query ? "جرّب كلمة مختلفة أو ارجع إلى كل العناصر." : "عند إضافة مصادر الوسائط من الإدارة ستظهر هنا كمجلدات مرتبة وواضحة للمشاهدين."}
        </p>
      </div>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="wiva-skeleton h-[430px]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="wiva-skeleton h-40" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => <div key={i} className="wiva-skeleton aspect-[2/3]" />)}
      </div>
    </div>
  );
}

function kindText(kind: string) {
  if (kind === "audio") return "صوت";
  if (kind === "image") return "صورة";
  if (kind === "episode") return "حلقة";
  return "فيديو";
}

function formatDuration(seconds: number) {
  const mins = Math.max(0, Math.round((seconds || 0) / 60));
  if (!mins) return "";
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} س ${m} د` : `${h} س`;
}
