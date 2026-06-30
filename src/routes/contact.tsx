import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, MessageSquare } from "lucide-react";
import { submitMessage } from "@/lib/messages";
import { pageTitle } from "@/lib/product";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({ meta: [{ title: pageTitle("تواصل معنا") }, { name: "description", content: "أرسل رسالة لإدارة الشبكة." }] }),
});

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", body: "" });
  const mut = useMutation({
    mutationFn: () => submitMessage(form),
    onSuccess: () => { toast.success("تم الإرسال"); setForm({ name: "", email: "", phone: "", subject: "", body: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div dir="rtl" className="min-h-[100dvh]">
      <header className="border-b border-white/10 bg-background/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground">← الرئيسية</Link>
          <h1 className="font-bold flex-1 inline-flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> تواصل معنا</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="glass-panel rounded-3xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="input-base" placeholder="الاسم *" required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input-base" type="email" placeholder="البريد الإلكتروني" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input-base" placeholder="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="input-base" placeholder="الموضوع" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <textarea className="input-base w-full" rows={6} maxLength={4000} required placeholder="رسالتك *" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <button type="submit" disabled={mut.isPending} className="btn-primary inline-flex items-center gap-2">
            <Send className="h-4 w-4" /> {mut.isPending ? "جارٍ الإرسال…" : "إرسال"}
          </button>
        </form>
      </main>
    </div>
  );
}
