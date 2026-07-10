import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type ViewerState } from "@/lib/api";
import { ContentSection } from "@/components/common";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useBrand } from "@/hooks/useBrand";

type AuthMode = "signin" | "signup";

function messageStatus(status?: string) {
  if (status === "done") return "تمت المتابعة";
  if (status === "read") return "تم الاطلاع";
  return "تم الإرسال";
}

function formatDate(value?: string | number) {
  if (!value) return "";
  try { return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return ""; }
}

export function Account() {
  const { brand } = useBrand();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [authError, setAuthError] = useState("");
  const [message, setMessage] = useState("");
  const [messageNotice, setMessageNotice] = useState("");

  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  const signedIn = !!state.data?.account;
  const messages = useQuery({
    queryKey: ["viewer-messages"],
    queryFn: api.viewerMessages,
    enabled: signedIn,
  });

  const auth = useMutation({
    mutationFn: () => mode === "signup"
      ? api.viewerSignup({ name, phone, email: email || undefined })
      : api.viewerSignin({ name, phone, email: email || undefined }),
    onSuccess: () => {
      setAuthError("");
      setName("");
      setPhone("");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["viewer-state"] });
      queryClient.invalidateQueries({ queryKey: ["viewer-messages"] });
    },
    onError: (error) => setAuthError(error instanceof Error ? error.message : "تعذر إكمال الطلب الآن."),
  });

  const logout = useMutation({
    mutationFn: api.viewerLogout,
    onSuccess: () => {
      queryClient.setQueryData<ViewerState>(["viewer-state"], undefined);
      queryClient.removeQueries({ queryKey: ["viewer-messages"] });
      queryClient.invalidateQueries({ queryKey: ["viewer-state"] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: () => api.sendViewerMessage({ message, context: "صفحة الحساب" }),
    onSuccess: () => {
      setMessage("");
      setMessageNotice("وصلت رسالتك إلى إدارة الشبكة.");
      queryClient.invalidateQueries({ queryKey: ["viewer-messages"] });
    },
    onError: (error) => setMessageNotice(error instanceof Error ? error.message : "تعذر إرسال الرسالة الآن."),
  });

  const submitAuth = (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");
    auth.mutate();
  };

  const submitMessage = (event: FormEvent) => {
    event.preventDefault();
    setMessageNotice("");
    if (message.trim()) sendMessage.mutate();
  };

  const account = state.data?.account;
  return (
    <div className="account-page">
      <section className="account-hero">
        <span className="badge">حسابي</span>
        <h1>{signedIn ? `مرحبًا ${account?.name || "بك"}` : `حسابك على ${brand}`}</h1>
        <p>{signedIn ? "مفضلتك ورسائلك محفوظة على حسابك." : "سجّل بحساب بسيط لحفظ المفضلة ومراسلة إدارة الشبكة."}</p>
      </section>

      {state.isLoading ? <LoadingState label="جاري فتح حسابك…" /> : null}
      {state.isError ? <ErrorState error={state.error} onRetry={() => { void state.refetch(); }} /> : null}

      {!state.isLoading && !state.isError && signedIn ? (
        <div className="account-grid">
          <div className="account-card">
            <div className="account-avatar" aria-hidden>{(account?.name || brand || "W").slice(0, 1)}</div>
            <div className="account-card-copy">
              <span>تم تسجيل الدخول</span>
              <strong>{account?.name}</strong>
              <small>{account?.phone}{account?.email ? ` · ${account.email}` : ""}</small>
            </div>
            <button className="btn btn-ghost btn-sm account-logout" type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
              تسجيل الخروج
            </button>
          </div>

          {state.data?.permissions?.manageLibrary ? (
            <div className="account-admin-note">
              <strong>إدارة المحتوى مفعّلة</strong>
              <span>يمكنك فتح أي مجلد في الاستراحة ورفع محتوى جديد إليه.</span>
              <AppLink href="/library/folders" className="btn btn-ghost btn-sm">فتح الاستراحة</AppLink>
            </div>
          ) : null}

          <ContentSection title="تواصل مع إدارة الشبكة" subtitle="أرسل ملاحظة أو طلبًا وسنحتفظ به في حسابك">
            <form className="viewer-message-form" onSubmit={submitMessage}>
              <label className="field">
                <span>رسالتك</span>
                <textarea className="textarea" rows={4} maxLength={1200} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اكتب رسالتك هنا…" required />
              </label>
              <div className="row-between viewer-form-actions">
                <span className={messageNotice.includes("وصلت") ? "form-success" : "form-note"}>{messageNotice}</span>
                <button className="btn btn-primary" type="submit" disabled={sendMessage.isPending || !message.trim()}>
                  {sendMessage.isPending ? "جاري الإرسال…" : "إرسال الرسالة"}
                </button>
              </div>
            </form>
          </ContentSection>

          <ContentSection title="رسائلي" subtitle="آخر الرسائل المرسلة من هذا الحساب">
            {messages.isLoading ? <LoadingState label="جاري تحميل الرسائل…" /> : null}
            {messages.isError ? <ErrorState error={messages.error} onRetry={() => { void messages.refetch(); }} /> : null}
            {!messages.isLoading && !messages.isError && !messages.data?.messages.length ? (
              <EmptyState icon="رسالة" title="لا توجد رسائل بعد" text="يمكنك إرسال أول رسالة من النموذج أعلاه." />
            ) : null}
            {messages.data?.messages.length ? (
              <div className="viewer-message-list">
                {messages.data.messages.map((item) => (
                  <article key={String(item.id)} className="viewer-message-item">
                    <p>{item.message || item.body}</p>
                    <div><span>{messageStatus(item.status)}</span><time>{formatDate(item.createdAt)}</time></div>
                  </article>
                ))}
              </div>
            ) : null}
          </ContentSection>

          <ContentSection title="اختصارات الحساب" subtitle="ارجع إلى محتواك بسرعة">
            <div className="settings-list">
              <AppLink href="/favorites" className="settings-row"><span>المفضلة</span><strong>عرض المحتوى المحفوظ</strong></AppLink>
              <AppLink href="/search" className="settings-row"><span>البحث</span><strong>ابحث في القنوات والاستراحة</strong></AppLink>
            </div>
          </ContentSection>
        </div>
      ) : null}

      {!state.isLoading && !state.isError && !signedIn ? (
        <section className="viewer-auth-panel" aria-label="تسجيل حساب المشاهد">
          <div className="viewer-auth-intro">
            <span className="badge">خطوة واحدة</span>
            <h2>{mode === "signup" ? "إنشاء حساب جديد" : "تسجيل الدخول"}</h2>
            <p>استخدم اسمك ورقم الهاتف. البريد الإلكتروني اختياري.</p>
            <div className="viewer-auth-benefits">
              <span>حفظ المفضلة</span><span>متابعة المشاهدة</span><span>مراسلة الشبكة</span>
            </div>
          </div>
          <form className="viewer-auth-form" onSubmit={submitAuth}>
            <div className="auth-mode-switch" role="tablist" aria-label="نوع العملية">
              <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setAuthError(""); }}>دخول</button>
              <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setAuthError(""); }}>حساب جديد</button>
            </div>
            <label className="field"><span>الاسم</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" required /></label>
            <label className="field"><span>رقم الهاتف</span><input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} inputMode="tel" autoComplete="tel" required /></label>
            {mode === "signup" ? <label className="field"><span>البريد الإلكتروني <small>اختياري</small></span><input className="input" value={email} onChange={(event) => setEmail(event.target.value)} type="email" maxLength={180} autoComplete="email" /></label> : null}
            {authError ? <p className="form-error" role="alert">{authError}</p> : null}
            <button className="btn btn-primary btn-block" type="submit" disabled={auth.isPending}>
              {auth.isPending ? "لحظة…" : mode === "signup" ? "إنشاء الحساب" : "دخول"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
