import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  RadioTower as Lighthouse, Tv, HardDrive, Wifi, Palette, ShieldCheck, Zap, Users, Globe2,
  CheckCircle2, ArrowLeft, Download, Sparkles, MessageSquare, MapPin,
} from "lucide-react";
import { AuroraBackground } from "@/components/AuroraBackground";
import { NetworkMap } from "@/components/NetworkMap";
import { fetchVisibleNetworks } from "@/lib/networks";
import { PRODUCT } from "@/lib/product";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: `${PRODUCT.name} — منصة البث المحلي وإدارة المكتبات للشبكات` },
      { name: "description", content: `${PRODUCT.name}: تطبيق ويندوز موحّد للبث المباشر متعدد القنوات وإدارة مكتبات الفيديو على الشبكة المحلية. حلّ كامل للفنادق، المقاهي، المدارس، والمجمعات السكنية.` },
      { property: "og:title", content: `${PRODUCT.name} — منصة البث المحلي` },
      { property: "og:description", content: "بثّ متعدد القنوات + مكتبة فيديو احترافية تعمل على شبكتك الداخلية بأداء منخفض التأخير." },
    ],
  }),
});

const FEATURES = [
  { icon: Tv, title: "بثّ متعدد القنوات", desc: "أجهزة التقاط، مشاركة الشاشة، وروابط بث تلفزيوني. كل القنوات تعمل بالتوازي بدون تعارض." },
  { icon: HardDrive, title: "مكتبة فيديو ذكية", desc: "فحص تلقائي لمجلداتك، جلب الأغلفة والمعلومات من TMDB، تصنيفات ومسارات مقفلة بالمستخدم." },
  { icon: Wifi, title: "يعمل داخل الشبكة", desc: "البث والمشاهدة على شبكتك المحلية مع أداء منخفض التأخير ودون اعتماد دائم على السحابة." },
  { icon: Palette, title: "تخصيص كامل للهوية", desc: "اسم، شعار، ألوان، شريط أخبار، رسائل ترحيب — كل شيء قابل للتخصيص ليطابق هويتك." },
  { icon: ShieldCheck, title: "تحكّم كامل بالصلاحيات", desc: "لوحة إدارة عبر المتصفح، مستخدمون متعددون، مسارات محتوى مقفلة، إحصائيات مشاهدة لحظية." },
  { icon: Zap, title: "محمول وسريع", desc: "تطبيق ويندوز واحد يمكن تشغيله من الجهاز المحلي أو جهاز الخادم مباشرة. الإعدادات محفوظة بجانب التطبيق." },
];

const PRICING_MONTHLY = [
  {
    name: "الأساسية",
    price: "$29",
    cycle: "/شهرياً",
    features: ["قناة بث واحدة", "مكتبة حتى 50 عنصر", "حتى 25 مشاهد", "دعم بالإيميل"],
  },
  {
    name: "الاحترافية",
    price: "$79",
    cycle: "/شهرياً",
    highlighted: true,
    features: ["حتى 8 قنوات بث", "مكتبة غير محدودة", "حتى 200 مشاهد", "تخصيص كامل للهوية", "دعم أولوية"],
  },
  {
    name: "المؤسسات",
    price: "$199",
    cycle: "/شهرياً",
    features: ["قنوات غير محدودة", "مكتبة غير محدودة", "مشاهدون بلا حدود", "خوادم متعددة", "دعم 24/7 + تركيب"],
  },
];

const PRICING_LIFETIME = [
  { name: "الأساسية — مدى الحياة", price: "$299", cycle: "دفعة واحدة", features: ["نفس مزايا الخطة الأساسية", "تحديثات سنة كاملة", "بدون اشتراك شهري"] },
  { name: "الاحترافية — مدى الحياة", price: "$799", cycle: "دفعة واحدة", highlighted: true, features: ["نفس مزايا الخطة الاحترافية", "تحديثات سنتين", "أولوية الميزات الجديدة"] },
  { name: "المؤسسات — مدى الحياة", price: "$1,999", cycle: "دفعة واحدة", features: ["نفس مزايا خطة المؤسسات", "تحديثات مدى الحياة", "تركيب وتدريب مجاني"] },
];

const FAQ = [
  { q: "هل يحتاج التطبيق إلى إنترنت؟", a: "لا. كل البث والمشاهدة وإدارة المكتبة تتم على شبكتك المحلية. الإنترنت يُستخدم فقط للتفعيل الأولي وتحديث معلومات المحتوى عند توفرها." },
  { q: "كيف يصل المشاهدون للبث؟", a: "كل ما يحتاجه المشاهد هو متصفح. التطبيق يفتح صفحة على عنوان IP الخاص بالسيرفر (مثل http://192.168.1.10:8080) ويفتحها المشاهدون من جوالاتهم أو شاشاتهم." },
  { q: "هل أستطيع استخدام نفس الكاميرا لأكثر من قناة؟", a: `نعم. ${PRODUCT.name} يستخدم نظام مشاركة المصدر (Stream Cache) فيفتح الجهاز مرة واحدة ويوزّع البث على القنوات التي تحتاجه.` },
  { q: "كيف أحصل على المفتاح بعد الدفع؟", a: "بعد إتمام الدفع وتأكيد الطلب، يصلك مفتاح الترخيص خلال ساعات على الإيميل، مع رابط تحميل آخر إصدار." },
  { q: "هل يمكنني إعادة بيع التطبيق لعملائي؟", a: "خطة المؤسسات تتضمن تخصيص الهوية وعقد إعادة بيع. تواصل معنا للتفاصيل." },
  { q: "ماذا يحدث عند نقل التطبيق لجهاز آخر؟", a: "المفتاح مرتبط ببصمة الجهاز. يمكن نقله مرة كل 30 يوم تلقائياً، أو فوراً عبر التواصل مع الدعم." },
];

function Landing() {
  const { data: networks = [] } = useQuery({ queryKey: ["public-networks-count"], queryFn: fetchVisibleNetworks, staleTime: 300_000 });

  return (
    <div dir="rtl" className="min-h-[100dvh] overflow-x-hidden">
      <AuroraBackground />

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/40 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow ring-1 ring-white/20">
            <Lighthouse className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-extrabold leading-tight sm:text-xl">
              <span className="text-gradient">{PRODUCT.name}</span>
            </h1>
            <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">منصة البث المحلي للشبكات</p>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            <a href="#features" className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5">المميزات</a>
            <a href="#networks" className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5">شبكاتنا</a>
            <a href="#pricing" className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5">الأسعار</a>
            <a href="#faq" className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5">أسئلة شائعة</a>
            <Link to="/contact" className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5">تواصل</Link>
          </nav>
          <a href="#pricing" className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover-lift">
            <Sparkles className="h-3.5 w-3.5" />
            <span>ابدأ الآن</span>
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-bold mb-6">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span><span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span></span>
          إصدار حديث — متاح الآن لويندوز
        </div>
        <h2 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.1]">
          <span className="text-gradient">منصة بثّ كاملة</span>
          <br />
          تعمل على شبكتك المحلية
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          {PRODUCT.name} يجمع البث المباشر متعدد القنوات وإدارة مكتبات الفيديو في تطبيق ويندوز واحد —
          تجربة محلية واضحة، منخفضة التأخير، وبتحكّم كامل من متصفحك.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="#pricing" className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-glow hover-lift">
            <Download className="h-4 w-4" />
            احصل على {PRODUCT.name}
          </a>
          <Link to="/contact" className="inline-flex items-center gap-2 rounded-full glass px-6 py-3 text-sm font-bold hover-lift">
            <MessageSquare className="h-4 w-4" />
            تواصل مع المبيعات
          </Link>
        </div>

        {/* Stats */}
        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-4">
          {[
            { v: networks.length || "10+", l: "شبكة مشتركة" },
            { v: "محلي", l: "تأخير منخفض" },
            { v: "24/7", l: "دعم فني" },
          ].map((s, i) => (
            <div key={i} className="glass-panel rounded-2xl p-5">
              <div className="text-3xl font-black text-gradient">{s.v}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <h3 className="text-3xl sm:text-4xl font-black tracking-tight">كل ما تحتاجه شبكتك في تطبيق واحد</h3>
          <p className="mt-3 text-muted-foreground">صُمّم {PRODUCT.name} ليجمع الإدارة والمشاهدة في تجربة واحدة</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={i} className="glass-panel rounded-3xl p-6 hover-lift">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow ring-1 ring-white/20 mb-4">
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h4 className="text-lg font-extrabold mb-2">{f.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* NETWORKS MAP */}
      <section id="networks" className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-bold mb-4">
            <Globe2 className="h-3.5 w-3.5 text-primary-glow" />
            ينتشرون حول العالم
          </div>
          <h3 className="text-3xl sm:text-4xl font-black tracking-tight">شبكاتنا المشتركة</h3>
          <p className="mt-3 text-muted-foreground">انضمّ لشبكات تثق بـ {PRODUCT.name} لإدارة بثّها ومكتبتها يومياً</p>
        </div>
        <NetworkMap />
        {networks.length > 0 && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {networks.slice(0, 6).map((n) => (
              <div key={n.id} className="glass-panel rounded-2xl p-4 flex items-center gap-3">
                <MapPin className="h-4 w-4 text-primary-glow shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{n.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{n.city}{n.city && n.country ? "، " : ""}{n.country}</div>
                </div>
                <span className="text-[10px] rounded-full bg-primary/15 text-primary-glow px-2 py-0.5 font-bold">{n.plan}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* PRICING */}
      <section id="pricing" className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <h3 className="text-3xl sm:text-4xl font-black tracking-tight">أسعار مرنة تناسب الجميع</h3>
          <p className="mt-3 text-muted-foreground">اشتراك شهري للمرونة، أو دفعة واحدة لمدى الحياة للتوفير</p>
        </div>

        <h4 className="text-xl font-bold mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-primary-glow" /> الاشتراك الشهري</h4>
        <div className="grid gap-5 lg:grid-cols-3 mb-12">
          {PRICING_MONTHLY.map((p, i) => (
            <PricingCard key={i} {...p} />
          ))}
        </div>

        <h4 className="text-xl font-bold mb-4 flex items-center gap-2"><Zap className="h-5 w-5 text-primary-glow" /> رخصة مدى الحياة</h4>
        <div className="grid gap-5 lg:grid-cols-3">
          {PRICING_LIFETIME.map((p, i) => (
            <PricingCard key={i} {...p} />
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          تجربة مجانية 7 أيام — لا حاجة لبطاقة ائتمان. الدفع يدوياً عبر التحويل البنكي أو وسائل أخرى يتم الاتفاق عليها.
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <h3 className="text-3xl sm:text-4xl font-black tracking-tight">أسئلة شائعة</h3>
        </div>
        <div className="space-y-3">
          {FAQ.map((f, i) => (
            <details key={i} className="glass-panel rounded-2xl p-5 group">
              <summary className="cursor-pointer font-bold flex items-center justify-between gap-3">
                <span>{f.q}</span>
                <ArrowLeft className="h-4 w-4 text-primary-glow group-open:-rotate-90 transition-transform" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="rounded-3xl bg-gradient-primary p-10 sm:p-14 text-center shadow-elegant ring-1 ring-white/20">
          <h3 className="text-3xl sm:text-4xl font-black text-primary-foreground tracking-tight">جاهز تبدأ؟</h3>
          <p className="mt-3 text-primary-foreground/90 max-w-xl mx-auto">
            احصل على {PRODUCT.name} وابدأ ببث قنواتك ومكتبتك على شبكتك خلال دقائق
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/contact" className="inline-flex items-center gap-2 rounded-full bg-background px-6 py-3 text-sm font-bold text-foreground hover-lift">
              <MessageSquare className="h-4 w-4" />
              تواصل للحصول على مفتاح
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-muted-foreground">
        <p>© 2026 {PRODUCT.name} — جميع الحقوق محفوظة</p>
        <p className="mt-1 opacity-60">منصة البث المحلي للشبكات الاحترافية</p>
      </footer>
    </div>
  );
}

function PricingCard({ name, price, cycle, features, highlighted }: {
  name: string; price: string; cycle: string; features: string[]; highlighted?: boolean;
}) {
  return (
    <div className={`relative rounded-3xl p-6 sm:p-7 ${highlighted ? "bg-gradient-primary shadow-elegant ring-1 ring-white/30" : "glass-panel"}`}>
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-background px-3 py-1 text-[10px] font-black text-primary-glow ring-1 ring-primary/30">
          الأكثر شعبية
        </div>
      )}
      <h5 className={`text-lg font-extrabold ${highlighted ? "text-primary-foreground" : ""}`}>{name}</h5>
      <div className="mt-3 flex items-baseline gap-1">
        <span className={`text-4xl font-black ${highlighted ? "text-primary-foreground" : "text-gradient"}`}>{price}</span>
        <span className={`text-xs ${highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{cycle}</span>
      </div>
      <ul className={`mt-5 space-y-2 text-sm ${highlighted ? "text-primary-foreground/95" : ""}`}>
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${highlighted ? "text-primary-foreground" : "text-primary-glow"}`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/contact"
        className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold hover-lift ${
          highlighted ? "bg-background text-foreground" : "bg-gradient-primary text-primary-foreground shadow-glow"
        }`}
      >
        اطلب مفتاح
      </Link>
    </div>
  );
}
