import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link,
} from "@tanstack/react-router";

import { ViewerLayout } from "@/components/ViewerLayout";
import { AdminLayout } from "@/components/AdminLayout";
import { SetupLayout } from "@/components/SetupLayout";

// Viewer pages
import { ViewerHome } from "@/pages/viewer/Home";
import { Live } from "@/pages/viewer/Live";
import { LiveGuide } from "@/pages/viewer/LiveGuide";
import { Library } from "@/pages/viewer/Library";
import { LibraryFolders } from "@/pages/viewer/LibraryFolders";
import { WatchMedia } from "@/pages/viewer/WatchMedia";
import { WatchChannel } from "@/pages/viewer/WatchChannel";
import { Search } from "@/pages/viewer/Search";
import { Favorites } from "@/pages/viewer/Favorites";
import { Account } from "@/pages/viewer/Account";

// Admin pages
import { AdminDashboard } from "@/pages/admin/Dashboard";
import { AdminChannels } from "@/pages/admin/Channels";
import { AdminChannelNew } from "@/pages/admin/ChannelNew";
import { AdminCapture } from "@/pages/admin/Capture";
import { AdminIptv } from "@/pages/admin/Iptv";
import { AdminIptvImport } from "@/pages/admin/IptvImport";
import { AdminLibrary } from "@/pages/admin/Library";
import { AdminLibrarySources } from "@/pages/admin/LibrarySources";
import { AdminLibraryBrowser } from "@/pages/admin/LibraryBrowser";
import { AdminViewers } from "@/pages/admin/Viewers";
import { AdminMessages } from "@/pages/admin/Messages";
import { AdminReports } from "@/pages/admin/Reports";
import { AdminBranding } from "@/pages/admin/Branding";
import { AdminSecurity } from "@/pages/admin/Security";
import { AdminLogs } from "@/pages/admin/Logs";
import { AdminDiagnostics } from "@/pages/admin/Diagnostics";
import { AdminSettings } from "@/pages/admin/Settings";
import { AdminAdvanced } from "@/pages/admin/Advanced";

// Setup pages
import { SetupWelcome } from "@/pages/setup/Welcome";
import { SetupNetwork } from "@/pages/setup/Network";
import { SetupAdminAccount } from "@/pages/setup/AdminAccount";
import { SetupBranding } from "@/pages/setup/Branding";
import { SetupPorts } from "@/pages/setup/Ports";
import { SetupLibrary } from "@/pages/setup/Library";
import { SetupIptv } from "@/pages/setup/Iptv";
import { SetupFinish } from "@/pages/setup/Finish";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="container page center" style={{ minHeight: "70vh" }}>
      <div className="state" style={{ border: "none" }}>
        <div className="state-icon">🔎</div>
        <div className="state-title">الصفحة غير موجودة</div>
        <p className="state-text">تعذّر العثور على المسار المطلوب.</p>
        <Link to="/" className="btn btn-primary">العودة للرئيسية</Link>
      </div>
    </div>
  ),
});

/* ---------------- Viewer ---------------- */
const viewerLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "viewer",
  component: ViewerLayout,
});

const viewerRoutes = [
  createRoute({ getParentRoute: () => viewerLayout, path: "/", component: ViewerHome }),
  createRoute({ getParentRoute: () => viewerLayout, path: "/live", component: Live }),
  createRoute({ getParentRoute: () => viewerLayout, path: "/live/guide", component: LiveGuide }),
  createRoute({ getParentRoute: () => viewerLayout, path: "/library", component: Library }),
  createRoute({ getParentRoute: () => viewerLayout, path: "/library/folders", component: LibraryFolders }),
  createRoute({ getParentRoute: () => viewerLayout, path: "/watch/media/$id", component: WatchMedia }),
  createRoute({ getParentRoute: () => viewerLayout, path: "/watch/channel/$id", component: WatchChannel }),
  createRoute({ getParentRoute: () => viewerLayout, path: "/search", component: Search }),
  createRoute({ getParentRoute: () => viewerLayout, path: "/favorites", component: Favorites }),
  createRoute({ getParentRoute: () => viewerLayout, path: "/account", component: Account }),
];

/* ---------------- Admin ---------------- */
const adminLayout = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminLayout,
});

const adminIndex = createRoute({
  getParentRoute: () => adminLayout,
  path: "/",
  component: AdminDashboard,
});

const adminRoutes = [
  adminIndex,
  createRoute({ getParentRoute: () => adminLayout, path: "dashboard", component: AdminDashboard }),
  createRoute({ getParentRoute: () => adminLayout, path: "channels", component: AdminChannels }),
  createRoute({ getParentRoute: () => adminLayout, path: "channels/new", component: AdminChannelNew }),
  createRoute({ getParentRoute: () => adminLayout, path: "capture", component: AdminCapture }),
  createRoute({ getParentRoute: () => adminLayout, path: "iptv", component: AdminIptv }),
  createRoute({ getParentRoute: () => adminLayout, path: "iptv/import", component: AdminIptvImport }),
  createRoute({ getParentRoute: () => adminLayout, path: "library", component: AdminLibrary }),
  createRoute({ getParentRoute: () => adminLayout, path: "library/sources", component: AdminLibrarySources }),
  createRoute({ getParentRoute: () => adminLayout, path: "library/browser", component: AdminLibraryBrowser }),
  createRoute({ getParentRoute: () => adminLayout, path: "viewers", component: AdminViewers }),
  createRoute({ getParentRoute: () => adminLayout, path: "messages", component: AdminMessages }),
  createRoute({ getParentRoute: () => adminLayout, path: "reports", component: AdminReports }),
  createRoute({ getParentRoute: () => adminLayout, path: "branding", component: AdminBranding }),
  createRoute({ getParentRoute: () => adminLayout, path: "security", component: AdminSecurity }),
  createRoute({ getParentRoute: () => adminLayout, path: "logs", component: AdminLogs }),
  createRoute({ getParentRoute: () => adminLayout, path: "diagnostics", component: AdminDiagnostics }),
  createRoute({ getParentRoute: () => adminLayout, path: "settings", component: AdminSettings }),
  createRoute({ getParentRoute: () => adminLayout, path: "advanced", component: AdminAdvanced }),
];

/* ---------------- Setup ---------------- */
const setupLayout = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupLayout,
});

const setupIndex = createRoute({
  getParentRoute: () => setupLayout,
  path: "/",
  component: SetupWelcome,
});

const setupRoutes = [
  setupIndex,
  createRoute({ getParentRoute: () => setupLayout, path: "welcome", component: SetupWelcome }),
  createRoute({ getParentRoute: () => setupLayout, path: "network", component: SetupNetwork }),
  createRoute({ getParentRoute: () => setupLayout, path: "admin-account", component: SetupAdminAccount }),
  createRoute({ getParentRoute: () => setupLayout, path: "branding", component: SetupBranding }),
  createRoute({ getParentRoute: () => setupLayout, path: "ports", component: SetupPorts }),
  createRoute({ getParentRoute: () => setupLayout, path: "library", component: SetupLibrary }),
  createRoute({ getParentRoute: () => setupLayout, path: "iptv", component: SetupIptv }),
  createRoute({ getParentRoute: () => setupLayout, path: "finish", component: SetupFinish }),
];

const routeTree = rootRoute.addChildren([
  viewerLayout.addChildren(viewerRoutes),
  adminLayout.addChildren(adminRoutes),
  setupLayout.addChildren(setupRoutes),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
