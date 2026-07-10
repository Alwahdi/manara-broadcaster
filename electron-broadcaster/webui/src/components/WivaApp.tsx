"use client";

import { QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { AppLink, NavigationProvider, useAppPath } from "@/components/AppLink";
import { SetupLayout } from "@/components/SetupLayout";
import { ErrorState, LoadingState } from "@/components/States";
import { ViewerLayout } from "@/components/ViewerLayout";
import { api, type AgentState, type PlatformStatus } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

import { AdminAdvanced } from "@/screens/admin/Advanced";
import { AdminBranding } from "@/screens/admin/Branding";
import { AdminCapture } from "@/screens/admin/Capture";
import { AdminChannelNew } from "@/screens/admin/ChannelNew";
import { AdminChannels } from "@/screens/admin/Channels";
import { AdminDashboard } from "@/screens/admin/Dashboard";
import { AdminDiagnostics } from "@/screens/admin/Diagnostics";
import { AdminIptv } from "@/screens/admin/Iptv";
import { AdminIptvImport } from "@/screens/admin/IptvImport";
import { AdminLibrary } from "@/screens/admin/Library";
import { AdminLibraryBrowser } from "@/screens/admin/LibraryBrowser";
import { AdminLibrarySources } from "@/screens/admin/LibrarySources";
import { AdminLogs } from "@/screens/admin/Logs";
import { AdminMessages } from "@/screens/admin/Messages";
import { AdminReports } from "@/screens/admin/Reports";
import { AdminSecurity } from "@/screens/admin/Security";
import { AdminSettings } from "@/screens/admin/Settings";
import { AdminViewers } from "@/screens/admin/Viewers";

import { SetupAdminAccount } from "@/screens/setup/AdminAccount";
import { SetupBranding } from "@/screens/setup/Branding";
import { SetupFinish } from "@/screens/setup/Finish";
import { SetupIptv } from "@/screens/setup/Iptv";
import { SetupLibrary } from "@/screens/setup/Library";
import { SetupNetwork } from "@/screens/setup/Network";
import { SetupPorts } from "@/screens/setup/Ports";
import { SetupWelcome } from "@/screens/setup/Welcome";

import { Account } from "@/screens/viewer/Account";
import { Favorites } from "@/screens/viewer/Favorites";
import { ViewerHome } from "@/screens/viewer/Home";
import { Library } from "@/screens/viewer/Library";
import { LibraryFolders } from "@/screens/viewer/LibraryFolders";
import { Live } from "@/screens/viewer/Live";
import { LiveGuide } from "@/screens/viewer/LiveGuide";
import { Search } from "@/screens/viewer/Search";
import { WatchChannel } from "@/screens/viewer/WatchChannel";
import { WatchMedia } from "@/screens/viewer/WatchMedia";

function adminPage(path: string) {
  if (path === "/admin" || path === "/admin/" || path === "/admin/dashboard") return <AdminDashboard />;
  if (path === "/admin/channels") return <AdminChannels />;
  if (path === "/admin/channels/new") return <AdminChannelNew />;
  if (path === "/admin/capture") return <AdminCapture />;
  if (path === "/admin/iptv") return <AdminIptv />;
  if (path === "/admin/iptv/import") return <AdminIptvImport />;
  if (path === "/admin/library") return <AdminLibrary />;
  if (path === "/admin/library/sources") return <AdminLibrarySources />;
  if (path === "/admin/library/browser") return <AdminLibraryBrowser />;
  if (path === "/admin/viewers") return <AdminViewers />;
  if (path === "/admin/messages") return <AdminMessages />;
  if (path === "/admin/reports") return <AdminReports />;
  if (path === "/admin/branding") return <AdminBranding />;
  if (path === "/admin/security") return <AdminSecurity />;
  if (path === "/admin/logs") return <AdminLogs />;
  if (path === "/admin/diagnostics") return <AdminDiagnostics />;
  if (path === "/admin/settings") return <AdminSettings />;
  if (path === "/admin/advanced") return <AdminAdvanced />;
  return <NotFound surface="admin" />;
}

function setupPage(path: string) {
  if (path === "/setup" || path === "/setup/" || path === "/setup/welcome") return <SetupWelcome />;
  if (path === "/setup/network") return <SetupNetwork />;
  if (path === "/setup/admin-account") return <SetupAdminAccount />;
  if (path === "/setup/branding") return <SetupBranding />;
  if (path === "/setup/ports") return <SetupPorts />;
  if (path === "/setup/library") return <SetupLibrary />;
  if (path === "/setup/iptv") return <SetupIptv />;
  if (path === "/setup/finish") return <SetupFinish />;
  return <NotFound surface="setup" />;
}

function viewerPage(path: string) {
  if (path === "/") return <ViewerHome />;
  if (path === "/live") return <Live />;
  if (path === "/live/guide") return <LiveGuide />;
  if (path === "/library") return <Library />;
  if (path === "/library/folders") return <LibraryFolders />;
  if (/^\/watch\/media\/[^/]+$/.test(path)) return <WatchMedia />;
  if (/^\/watch\/channel\/[^/]+$/.test(path)) return <WatchChannel />;
  if (path === "/search") return <Search />;
  if (path === "/favorites") return <Favorites />;
  if (path === "/account") return <Account />;
  return <NotFound surface="viewer" />;
}

function NotFound({ surface }: { surface: "viewer" | "admin" | "setup" }) {
  const href = surface === "admin" ? "/admin/dashboard" : surface === "setup" ? "/setup/welcome" : "/";
  return (
    <div className="center" style={{ minHeight: "58vh" }}>
      <div className="state" style={{ border: "none" }}>
        <div className="state-icon">🔎</div>
        <div className="state-title">الصفحة غير موجودة</div>
        <p className="state-text">تعذّر العثور على المسار المطلوب.</p>
        <AppLink href={href} className="btn btn-primary">العودة للمسار الرئيسي</AppLink>
      </div>
    </div>
  );
}

function RoutedApp() {
  const path = useAppPath();
  if (path.startsWith("/admin")) return <AdminLayout>{adminPage(path)}</AdminLayout>;
  if (path.startsWith("/setup") || path === "/agent") return <SetupLayout>{setupPage(path === "/agent" ? "/setup/welcome" : path)}</SetupLayout>;
  return <ViewerLayout>{viewerPage(path)}</ViewerLayout>;
}

function platformState(state?: AgentState) {
  return String(state?.subscription?.state || "unregistered");
}

function canEnterApp(state?: AgentState) {
  return platformState(state) === "active";
}

function statusLabel(subscription?: PlatformStatus) {
  const state = String(subscription?.state || "unregistered");
  if (state === "pending") return "بانتظار الموافقة";
  if (state === "expired") return "الاشتراك منتهي";
  if (state === "suspended") return "الحساب موقوف مؤقتاً";
  if (state === "offline" || state === "cached") return "تعذر الاتصال";
  return "غير مسجل";
}

function activationTitle(subscription?: PlatformStatus) {
  const state = String(subscription?.state || "unregistered");
  if (state === "pending") return "طلبك وصل بنجاح";
  if (state === "expired") return "يلزم تجديد الاشتراك";
  if (state === "suspended") return "الخدمة متوقفة مؤقتاً";
  return "لا يمكن فتح التطبيق الآن";
}

function activationMessage(subscription?: PlatformStatus) {
  const state = String(subscription?.state || "unregistered");
  if (state === "pending") {
    return "سيعمل WIVA تلقائياً بعد الموافقة على هذا الجهاز وتفعيل الاشتراك.";
  }
  if (state === "expired") {
    return "انتهت مدة الاشتراك لهذا الجهاز. تواصل مع مزود الخدمة لتجديده ثم حدّث الحالة.";
  }
  if (state === "suspended") {
    return "الخدمة متوقفة مؤقتاً لهذا الجهاز. تواصل مع مزود الخدمة ثم حدّث الحالة.";
  }
  if (state === "offline" || state === "cached") {
    return "تعذر التحقق من حالة الاشتراك الآن. تأكد من اتصال الجهاز بالإنترنت ثم جرّب تحديث الحالة.";
  }
  return "سجّل هذا الجهاز لإكمال الإعداد، ثم انتظر تفعيل الاشتراك.";
}

function RegistrationGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["agent-state"],
    queryFn: api.agentState,
    refetchInterval: (q) => (canEnterApp(q.state.data) ? false : 20_000),
  });

  if (query.isLoading) return <LoadingState label="جارٍ التحقق من تسجيل الجهاز…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (canEnterApp(query.data)) return <>{children}</>;

  const subscription = query.data?.subscription;
  const state = platformState(query.data);
  if (state === "pending" || state === "expired" || state === "suspended" || state === "offline" || state === "cached") {
    return (
      <ActivationPending
        agent={query.data}
        subscription={subscription}
        onRefresh={async () => {
          await api.refreshPlatform();
          await qc.invalidateQueries({ queryKey: ["agent-state"] });
        }}
        refreshing={query.isFetching}
      />
    );
  }

  return <ActivationForm agent={query.data} />;
}

function ActivationForm({ agent }: { agent?: AgentState }) {
  const qc = useQueryClient();
  const [tenantName, setTenantName] = useState(agent?.networkName || agent?.brandName || "");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api.requestActivation({
        tenantName: tenantName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        channel: "stable",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-state"] }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!tenantName.trim() || !contactEmail.trim()) return;
    mutation.mutate();
  }

  return (
    <main className="activation-shell" data-wiva-app="next">
      <section className="activation-panel">
        <div className="activation-brand">
          <img src="/wiva-logo.png" alt="" className="activation-logo" />
          <div>
            <span className="badge">WIVA Agent</span>
            <h1>تسجيل الجهاز</h1>
            <p>سجّل هذا الجهاز أولاً، ثم انتظر تفعيل الاشتراك من مالك المنصة قبل فتح لوحة الإدارة أو المكتبة.</p>
          </div>
        </div>
        <form onSubmit={submit} className="activation-form">
          <div className="field">
            <label htmlFor="tenantName">اسم الشبكة أو المنشأة</label>
            <input
              id="tenantName"
              className="input"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="مثال: استراحة النور"
              autoComplete="organization"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="contactEmail">البريد الإلكتروني</label>
            <input
              id="contactEmail"
              className="input"
              dir="ltr"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="owner@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="contactPhone">رقم التواصل</label>
            <input
              id="contactPhone"
              className="input"
              dir="ltr"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+967..."
              autoComplete="tel"
            />
          </div>
          {mutation.isError ? (
            <p className="activation-error">{(mutation.error as Error).message}</p>
          ) : null}
          <button className="btn btn-primary btn-block" type="submit" disabled={mutation.isPending || !tenantName.trim() || !contactEmail.trim()}>
            {mutation.isPending ? "جارٍ إرسال الطلب…" : "إرسال طلب التسجيل"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ActivationPending({
  agent,
  subscription,
  onRefresh,
  refreshing,
}: {
  agent?: AgentState;
  subscription?: PlatformStatus;
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
}) {
  const features = useMemo(
    () => Object.entries(subscription?.features || {}).filter(([, enabled]) => enabled).map(([key]) => key),
    [subscription?.features],
  );
  return (
    <main className="activation-shell" data-wiva-app="next">
      <section className="activation-panel activation-panel-centered">
        <img src="/wiva-logo.png" alt="" className="activation-logo activation-logo-large" />
        <span className="badge badge-warn">{statusLabel(subscription)}</span>
        <h1>{activationTitle(subscription)}</h1>
        <p>{activationMessage(subscription)}</p>
        <div className="activation-summary">
          <div>
            <span>الشبكة</span>
            <strong>{subscription?.instance?.tenantName || agent?.networkName || "—"}</strong>
          </div>
          <div>
            <span>رقم الطلب</span>
            <strong className="mono">{subscription?.activationId || "—"}</strong>
          </div>
          <div>
            <span>الخطة</span>
            <strong>{subscription?.instance?.plan || "بانتظار التفعيل"}</strong>
          </div>
          <div>
            <span>الميزات</span>
            <strong>{features.length ? features.join("، ") : "—"}</strong>
          </div>
        </div>
        <button className="btn btn-primary" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "جارٍ التحقق…" : "تحديث الحالة"}
        </button>
      </section>
    </main>
  );
}

export function WivaApp() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationProvider>
        {mounted ? (
          <RegistrationGate>
            <RoutedApp />
          </RegistrationGate>
        ) : (
          <main className="boot-shell" data-wiva-app="next">
            <img src="/wiva-logo.png" alt="" className="boot-logo" />
            <div>
              <h1>WIVA</h1>
              <p>جارٍ تجهيز الواجهة…</p>
            </div>
          </main>
        )}
      </NavigationProvider>
    </QueryClientProvider>
  );
}
