import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck, Bell, BookOpen, CalendarDays, ChevronDown, CircleUserRound, Compass, Download, Gift,
  LifeBuoy, LogIn, Menu, MessageCircle, MoreHorizontal,
  Plus, Settings2, ShieldCheck, Trophy, Users, Wallet, WifiOff, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { isVerifiedAccount, mediaUrl } from "@/lib/mediaUrl";
import OnboardingTour from "@/features/app/OnboardingTour";

type AppUser = { id: number; name?: string | null; email?: string | null; role?: string; accountType?: string; status?: string; avatarUrl?: string | null; moderatorPermissions?: string[] | null };
type Notice = { id: number; title?: string; body?: string; message?: string; readAt?: string | Date | null; createdAt?: string | Date };
type NavItem = { href: string; label: string; icon: LucideIcon };

const primaryNav: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: Compass },
  { href: "/book", label: "احجز", icon: CalendarDays },
  { href: "/play", label: "العب", icon: Trophy },
  { href: "/squad", label: "السكواد", icon: Users },
  { href: "/rewards", label: "المكافآت", icon: Gift },
  { href: "/profile", label: "حسابي", icon: CircleUserRound },
];
const mobileNav = primaryNav.filter(item => item.href !== "/squad");

export function AppShell({ children, user }: { children: ReactNode; user: AppUser | null }) {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "online" | "offline" | "unavailable">(() => typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "checking");
  const [noticesOpen, setNoticesOpen] = useState(false);
  const isSettingsRoute = location === "/settings";
  const referralCodeFromUrl = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase() || "";
  const referralTracking = (trpc as any).referrals.track.useMutation();
  useEffect(() => {
    if (!/^[A-F0-9]{12}$/.test(referralCodeFromUrl)) return;
    let alreadyTracked = false;
    try {
      window.sessionStorage.setItem("brzly-referral-code", referralCodeFromUrl);
      alreadyTracked = window.sessionStorage.getItem(`brzly-referral-visit:${referralCodeFromUrl}`) === "done";
      if (!alreadyTracked) window.sessionStorage.setItem(`brzly-referral-visit:${referralCodeFromUrl}`, "done");
    } catch { /* Referral attribution can still use the URL if storage is unavailable. */ }
    if (alreadyTracked) return;
    const clientEventId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    void referralTracking.mutateAsync({ code: referralCodeFromUrl, eventType: "visit", clientEventId }).catch(() => undefined);
  }, [referralCodeFromUrl, location]);
  const notificationsQuery = (trpc as any).notifications.list.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const markRead = (trpc as any).notifications.markRead.useMutation();
  const logout = (trpc as any).auth.logout.useMutation();
  const raw = notificationsQuery.data as any;
  const notices: Notice[] = raw?.items ?? (Array.isArray(raw) ? raw : []);
  const unread = notices.filter(item => !item.readAt).length;
  const displayName = user?.name || user?.email?.split("@")[0] || "لاعب جديد";
  const roleLabel = user?.role === "owner" || user?.accountType === "owner" ? (user?.role === "owner" ? "صاحب ملعب" : "طلب تفعيل ملعب") : user?.role === "admin" || user?.role === "super_admin" ? "إدارة المنصة" : user?.role === "moderator" ? "مشرف" : "لاعب";
  const utilityLinks = useMemo<NavItem[]>(() => {
    if (!user) return [
      { href: "/join", label: "سجّل دخولك", icon: LogIn },
      { href: "/login", label: "ادخل لحسابك", icon: LogIn },
      { href: "/players", label: "اكتشف اللعيبة", icon: BookOpen },
      { href: "/download", label: "حمّل التطبيق", icon: Download },
      { href: "/support", label: "الدعم والمساعدة", icon: LifeBuoy },
    ];
    const links: NavItem[] = [
      { href: "/profile", label: "البروفايل", icon: CircleUserRound },
      { href: "/players", label: "اكتشف اللعيبة", icon: BookOpen },
      { href: "/settings", label: "الإعدادات", icon: Settings2 },
      { href: "/squad", label: "السكواد", icon: Users },
      { href: "/suggest-pitch", label: "اقترح ملعب", icon: Plus },
      { href: "/support", label: "الدعم والمساعدة", icon: LifeBuoy },
      { href: "/download", label: "حمّل التطبيق", icon: Download },
    ];
    if (user.role === "admin" || user.role === "super_admin" || (user.role === "moderator" && Boolean(user.moderatorPermissions?.length))) {
      links.unshift({ href: "/admin-dashboard/", label: "لوحة الإدارة", icon: ShieldCheck });
    }
    if (user.role === "owner" || user.accountType === "owner") links.unshift({ href: "/owner", label: "إدارة الملعب", icon: Wallet });
    return links;
  }, [user]);
  const moreLinks = utilityLinks.filter(item => !mobileNav.some(primary => primary.href === item.href));
  const moreIsActive = moreLinks.some(item => location === item.href || location.startsWith(`${item.href}/`));

  useEffect(() => {
    let active = true;
    const checkConnection = async () => {
      if (!navigator.onLine) {
        if (active) setConnectionStatus("offline");
        return;
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4_000);
      try {
        const response = await fetch("/api/health", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (active) setConnectionStatus(response.ok ? "online" : "unavailable");
      } catch {
        if (active) setConnectionStatus(navigator.onLine ? "unavailable" : "offline");
      } finally {
        window.clearTimeout(timeout);
      }
    };
    const handleOffline = () => setConnectionStatus("offline");
    const handleOnline = () => void checkConnection();
    const checkWhenVisible = () => { if (document.visibilityState === "visible") void checkConnection(); };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", checkWhenVisible);
    const interval = window.setInterval(checkWhenVisible, 60_000);
    void checkConnection();
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);

  const openNotice = async (notice: Notice) => {
    if (!notice.readAt) {
      try { await markRead.mutateAsync({ id: notice.id }); await notificationsQuery.refetch(); } catch { /* keep the notification visible */ }
    }
  };
  return (
    <div className={`app-frame ${isSettingsRoute ? "settings-fullscreen-app" : ""}`} dir="rtl">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="البرازيلي - الرئيسية">
          <span className="brand-mark"><span /><i /></span>
          <span className="brand-word">البرازيلي<span className="brand-dot">.</span></span>
        </Link>
        <nav className="desktop-nav" aria-label="التنقل الرئيسي">
          {primaryNav.map(item => {
            const Icon = item.icon;
            const active = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="topbar-actions">
          <button type="button" className="utility-menu-button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen}><MoreHorizontal size={17} /><span>المزيد</span></button>
          {user && <Link href="/rewards" className={`top-wallet-link ${location.startsWith("/rewards") ? "active" : ""}`} aria-label="افتح المكافآت"><Gift size={17} /><span>المكافآت</span></Link>}
          {user && <div className="notice-wrap">
            <button className="icon-button notice-button" aria-label="التنبيهات" onClick={() => setNoticesOpen(value => !value)}><Bell size={19} />{unread > 0 && <span className="notification-dot">{unread > 9 ? "9+" : unread}</span>}</button>
            {noticesOpen && <div className="notice-popover">
              <div className="popover-heading"><strong>التنبيهات</strong><button onClick={() => setNoticesOpen(false)} aria-label="إغلاق"><X size={16} /></button></div>
              {notificationsQuery.isLoading ? <p className="muted small">بنحمّل التنبيهات...</p> : notices.length === 0 ? <p className="muted small empty-notice">مفيش تنبيهات جديدة دلوقتي</p> : notices.slice(0, 8).map(notice => <button key={notice.id} className={`notice-item ${notice.readAt ? "" : "unread"}`} onClick={() => openNotice(notice)}><span className="notice-led" /><span><b>{notice.title || "فيه جديد"}</b><small>{notice.body || notice.message || "فيه تحديث جديد على حسابك"}</small></span></button>)}
            </div>}
          </div>}
          {user ? <button className="user-chip" onClick={() => setLocation("/profile")}><span className="user-avatar">{mediaUrl(user.avatarUrl) ? <img src={mediaUrl(user.avatarUrl)} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : displayName.charAt(0)}</span><span className="user-chip-copy"><b>{displayName} {isVerifiedAccount(user) && <BadgeCheck size={14} aria-label="حساب موثّق" />}</b><small>{roleLabel}</small></span><ChevronDown size={15} /></button> : <Link href="/join" className="top-login">ادخل / اعمل حساب</Link>}
          <button className="mobile-menu-button icon-button" onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? "اقفل القائمة" : "افتح القائمة"} aria-expanded={menuOpen}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </header>
      {connectionStatus !== "online" && connectionStatus !== "checking" && <div className="offline-status" role="status" aria-live="polite"><WifiOff size={18} /><span className="offline-status-copy"><strong>{connectionStatus === "offline" ? "النت فصل؟ اتأكد إنك موصل نت." : "السيرفر مش بيرد علينا دلوقتي"}</strong><small>{connectionStatus === "offline" ? "راجع اتصالك وجرب تاني. الحجز والمكالمات وتسجيل الدخول محتاجين نت." : "فيه مشكلة في الاتصال بالسيرفر. استنى شوية وجرب تاني."}</small></span></div>}
      {menuOpen && <div className="utility-menu-panel" role="region" aria-label="روابط تانية"><div className="utility-menu-links">{moreLinks.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}><Icon size={17} />{item.label}</Link>; })}{user && <button onClick={async () => { try { await logout.mutateAsync(); } finally { setMenuOpen(false); window.location.assign("/join"); } }}><LogIn size={17} />سجّل خروج</button>}</div></div>}
      <main className={isSettingsRoute ? "settings-fullscreen-main" : "page-wrap"}>{children}</main>
      {!isSettingsRoute && <footer className="site-footer"><div className="footer-brand"><span className="brand-mark small-mark"><span /><i /></span><strong>البرازيلي</strong></div><span>يلا نلعب!</span><span>© {new Date().getFullYear()} البرازيلي</span></footer>}
      {!isSettingsRoute && <nav className="mobile-bottom-nav" aria-label="تنقل الهاتف">{mobileNav.map(item => { const Icon = item.icon; const active = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon size={19} strokeWidth={active ? 2.3 : 1.7} /><span>{item.label}</span></Link>; })}<button type="button" className={moreIsActive || menuOpen ? "active" : ""} onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen}><MoreHorizontal size={19} /><span>المزيد</span></button></nav>}
      {user && <OnboardingTour userId={user.id} />}
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}

export function SectionHeader({ title, subtitle, href, actionLabel = "شوف الكل" }: { title: string; subtitle?: string; href?: string; actionLabel?: string }) {
  return <div className="section-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{href && <Link href={href} className="text-link">{actionLabel}<span>←</span></Link>}</div>;
}
