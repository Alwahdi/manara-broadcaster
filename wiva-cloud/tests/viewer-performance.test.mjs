import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const source = (path) => readFileSync(join(root, path), "utf8");

test("viewer navigation does not block every route on a database session lookup", () => {
  const shell = source("src/components/ViewerShell.tsx");
  assert.doesNotMatch(shell, /currentViewerAccount|await\s+currentViewer/);
  assert.match(shell, /href="\/account"/);
});

test("common catalog routes use a short cache that admin mutations invalidate", () => {
  const database = source("src/lib/db.ts");
  const assetRoute = source("src/app/api/admin/assets/[id]/route.ts");
  const providerRoute = source("src/app/api/admin/providers/[id]/route.ts");
  assert.match(database, /unstable_cache/);
  assert.match(database, /revalidate:\s*20/);
  assert.match(database, /wiva-viewer-catalog/);
  assert.match(assetRoute, /revalidateTag\("wiva-viewer-catalog"/);
  assert.match(providerRoute, /revalidateTag\("wiva-viewer-catalog"/);
});

test("primary viewer destinations are ISR pages while filters keep server-side search", () => {
  for (const route of ["live", "movies", "series"]) {
    assert.match(source(`src/app/(viewer)/${route}/page.tsx`), /export const revalidate = 20/);
    assert.doesNotMatch(source(`src/app/(viewer)/${route}/page.tsx`), /searchParams/);
    assert.match(source(`src/app/(viewer)/${route}/filter/page.tsx`), /searchParams/);
  }
  assert.match(source("src/components/CatalogPage.tsx"), /filters\}\?\$\{params\}/);
});

test("viewer mobile experience has route feedback, safe-area navigation, and swipeable rails", () => {
  const loading = source("src/app/(viewer)/loading.tsx");
  const styles = source("src/app/globals.css");
  const section = source("src/components/Section.tsx");
  assert.match(loading, /aria-busy="true"/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /scroll-snap-type:\s*inline mandatory/);
  assert.match(section, /media-rail/);
});

test("viewer home and account use a direct app-first information architecture", () => {
  const home = source("src/app/(viewer)/page.tsx");
  const account = source("src/app/(viewer)/account/page.tsx");
  const shell = source("src/components/ViewerShell.tsx");
  const navigation = source("src/components/ViewerNavigation.tsx");
  const styles = source("src/app/globals.css");
  assert.match(home, /home-destinations/);
  assert.match(home, /ماذا تريد أن تشاهد/);
  assert.doesNotMatch(home, /لماذا WIVA|كل شاشتك في|className="hero"/);
  assert.match(account, /account-profile-card/);
  assert.match(account, /account-action-list/);
  assert.match(navigation, /primary-destination/);
  assert.doesNotMatch(shell, /viewer-footer/);
  assert.match(styles, /\.mobile-nav a\.primary-destination/);
});

test("public catalog fails closed for restricted and non-playable provider metadata", () => {
  const database = source("src/lib/db.ts");
  const schema = source("db/schema.sql");
  const safety = source("src/lib/catalog-safety.ts");
  assert.match(database, /a\.is_restricted = false and a\.is_playable = true/);
  assert.match(schema, /metadata_review text not null default 'approved'/);
  assert.match(schema, /set is_restricted = true, metadata_review = 'needs_review'/);
  assert.match(safety, /isRestrictedMetadata/);
  assert.match(safety, /pussy\|blowjob\|gangbang/);
  assert.match(database, /wiva-viewer-assets-v3/);
  assert.match(database, /wiva-viewer-catalog-v3/);
  assert.match(safety, /isScheduleMetadata/);
});

test("viewer activity is account-backed and device sessions are revocable", () => {
  const schema = source("db/schema.sql");
  const activity = source("src/app/api/viewer/activity/[id]/route.ts");
  const sessions = source("src/components/DeviceSessions.tsx");
  const player = source("src/components/PlayerClient.tsx");
  assert.match(schema, /wiva_cloud_viewer_favorites/);
  assert.match(schema, /wiva_cloud_viewer_progress/);
  assert.match(activity, /setViewerFavorite/);
  assert.match(activity, /saveViewerProgress/);
  assert.match(player, /keepalive: true/);
  assert.match(sessions, /خروج البقية/);
});

test("admin dashboard prioritizes operational queues instead of architecture copy", () => {
  const dashboard = source("src/app/admin/(panel)/page.tsx");
  assert.match(dashboard, /قائمة العمل/);
  assert.match(dashboard, /مراجعة سلامة المحتوى/);
  assert.match(dashboard, /طلبات التجديد/);
  assert.doesNotMatch(dashboard, /كيف يصل المحتوى إلى المشاهد/);
});

test("match schedule is structured information rather than a fake playable channel", () => {
  const schema = source("db/schema.sql");
  const database = source("src/lib/db.ts");
  const home = source("src/app/(viewer)/page.tsx");
  const schedule = source("src/components/MatchScheduleSection.tsx");
  const adminRoute = source("src/app/api/admin/schedule/route.ts");
  const validation = source("src/lib/match-schedule.ts");
  assert.match(schema, /create table if not exists wiva_cloud_match_schedule/);
  assert.match(database, /ends_at > now\(\) - interval '15 minutes'/);
  assert.match(home, /MatchScheduleSection/);
  assert.match(schedule, /جدول المباريات/);
  assert.doesNotMatch(schedule, /href=|\/watch\//);
  assert.match(adminRoute, /requireAdminRequest/);
  assert.match(adminRoute, /assertSameOrigin/);
  assert.match(validation, /endsAt\.getTime\(\) - startsAt\.getTime\(\)/);
});
