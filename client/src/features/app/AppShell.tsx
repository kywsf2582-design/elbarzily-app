import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell, BookOpen, CalendarDays, ChevronDown, CircleUserRound, Compass, Download, Gift,
  LifeBuoy, LogIn, Menu, MessageCircle, Monitor, Moon, MoreHorizontal,
  Plus, Settings2, Sun, Trophy, Users, Wallet, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";

type AppUser = { id: number; name?: string | null; email?: string | null; role?: string; accountType?: string; status?: string; avatarUrl?: string | null };
type Notice = { id: number; title?: string; body?: string; message?: string; readAt?: string | Date | null; createdAt?: string | Date };
type ThemePreference = "light" | "dark" | "system";
type NavItem = { href: string; label: string; icon: LucideIcon };

const primaryNav: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: Compass },
  { href: "/book", label: "احجز", icon: CalendarDays },
  { href: "/play", label: "العب", icon: Trophy },
  { href: "/squad", label: "السكواد", icon: Users },
  { href: "/chat", label: "الشات", icon: MessageCircle },
  { href: "/profile", label: "حسابي", icon: CircleUserRound },
];
const mobileNav = primaryNav.filter(item => item.href !== "/squad");
const themeChoices: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "فاتح", icon: Sun },
  { value: "dark", label: "داكن", icon: Moon },
  { value: "system", label: "حسب الجهاز", icon: Monitor },
];

export function AppShell({ children, user }: { children: ReactNode; user: AppUser | null }) {
  const [location, setLocation] = useLocation();
  const { theme, preference, setThemePreference } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [noticesOpen, setNoticesOpen] = useState(false);
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
      { href: "/join", label: "تسجيل الدخول", icon: LogIn },
      { href: "/login", label: "دخول الحساب", icon: LogIn },
      { href: "/players", label: "اكتشف اللاعبين", icon: BookOpen },
      { href: "/download", label: "تنزيل التطبيق", icon: Download },
      { href: "/support", label: "الدعم", icon: LifeBuoy },
    ];
    const links: NavItem[] = [
      { href: "/profile", label: "ملفي الشخصي", icon: CircleUserRound },
      { href: "/players", label: "اكتشف اللاعبين", icon: BookOpen },
      { href: "/rewards", label: "المكافآت والجوائز", icon: Gift },
      { href: "/settings", label: "الإعدادات", icon: Settings2 },
      { href: "/squad", label: "السكواد", icon: Users },
      { href: "/suggest-pitch", label: "اقتراح ملعب", icon: Plus },
      { href: "/support", label: "الدعم", icon: LifeBuoy },
      { href: "/download", label: "تنزيل التطبيق", icon: Download },
    ];
    if (user.role === "owner" || user.accountType === "owner") links.unshift({ href: "/owner", label: "إدارة الملعب", icon: Wallet });
    return links;
  }, [user]);
  const moreLinks = utilityLinks.filter(item => !mobileNav.some(primary => primary.href === item.href));
  const moreIsActive = moreLinks.some(item => location === item.href || location.startsWith(`${item.href}/`));

  useEffect(() => {
    if (!themeMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!themeMenuRef.current?.contains(event.target as Node)) setThemeMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setThemeMenuOpen(false); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [themeMenuOpen]);

  const openNotice = async (notice: Notice) => {
    if (!notice.readAt) {
      try { await markRead.mutateAsync({ id: notice.id }); await notificationsQuery.refetch(); } catch { /* keep the notification visible */ }
    }
  };
  const setPreference = (next: ThemePreference) => { setThemePreference(next); setThemeMenuOpen(false); setMenuOpen(false); };
  const ThemeOptions = ({ mobile = false }: { mobile?: boolean }) => <div className={mobile ? "mobile-theme-options" : "theme-options"} role="group" aria-label="اختيار المظهر">
    {themeChoices.map(choice => { const Icon = choice.icon; return <button type="button" key={choice.value} aria-pressed={preference === choice.value} className={preference === choice.value ? "selected" : ""} onClick={() => setPreference(choice.value)}><Icon size={15} /><span>{choice.label}</span></button>; })}
  </div>;

  return (
    <div className="app-frame" dir="rtl">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="البرازيلي - الرئيسية">
          <span className="brand-mark"><span /><i /></span>
          <span className="brand-word">البرازيلي<span className="brand-dot">.</span></span>
        </Link>
        <nav className="desktop-nav" aria-label="القائمة الرئيسية">
          {primaryNav.map(item => {
            const Icon = item.icon;
            const active = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="topbar-actions">
          <button type="button" className="utility-menu-button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen}><MoreHorizontal size={17} /><span>المزيد</span></button>
          <div className="theme-control" ref={themeMenuRef}>
            <button className="icon-button theme-control-trigger" onClick={() => setThemeMenuOpen(value => !value)} aria-label="اختيار مظهر التطبيق" aria-expanded={themeMenuOpen} aria-controls="theme-options-popover">
              {preference === "system" ? <Monitor size={18} /> : theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {themeMenuOpen && <div className="theme-popover" id="theme-options-popover"><strong>مظهر التطبيق</strong><ThemeOptions /></div>}
          </div>
          {user && <Link href="/rewards" className={`top-wallet-link ${location.startsWith("/rewards") ? "active" : ""}`} aria-label="فتح المحفظة"><Wallet size={17} /><span>المحفظة</span></Link>}
          {user && <div className="notice-wrap">
            <button className="icon-button notice-button" aria-label="التنبيهات" onClick={() => setNoticesOpen(value => !value)}><Bell size={19} />{unread > 0 && <span className="notification-dot">{unread > 9 ? "9+" : unread}</span>}</button>
            {noticesOpen && <div className="notice-popover">
              <div className="popover-heading"><strong>التنبيهات</strong><button onClick={() => setNoticesOpen(false)} aria-label="إغلاق"><X size={16} /></button></div>
              {notificationsQuery.isLoading ? <p className="muted small">جارٍ تحميل التنبيهات...</p> : notices.length === 0 ? <p className="muted small empty-notice">لا توجد تنبيهات جديدة</p> : notices.slice(0, 8).map(notice => <button key={notice.id} className={`notice-item ${notice.readAt ? "" : "unread"}`} onClick={() => openNotice(notice)}><span className="notice-led" /><span><b>{notice.title || "تحديث جديد"}</b><small>{notice.body || notice.message || "لديك تحديث في حسابك"}</small></span></button>)}
            </div>}
          </div>}
          {user ? <button className="user-chip" onClick={() => setLocation("/profile")}><span className="user-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : displayName.charAt(0)}</span><span className="user-chip-copy"><b>{displayName}</b><small>{roleLabel}</small></span><ChevronDown size={15} /></button> : <Link href="/join" className="top-login">دخول / إنشاء حساب</Link>}
          <button className="mobile-menu-button icon-button" onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={menuOpen}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </header>
      {menuOpen && <div className="utility-menu-panel" role="region" aria-label="روابط إضافية"><div className="utility-menu-links">{moreLinks.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}><Icon size={17} />{item.label}</Link>; })}{user && <button onClick={async () => { try { await logout.mutateAsync(); } finally { setMenuOpen(false); window.location.assign("/join"); } }}><LogIn size={17} />تسجيل الخروج</button>}</div><section className="mobile-theme-picker"><b>المظهر</b><ThemeOptions mobile /></section></div>}
      <main className="page-wrap">{children}</main>
      <footer className="site-footer"><div className="footer-brand"><span className="brand-mark small-mark"><span /><i /></span><strong>البرازيلي</strong></div><span>اللعب يبدأ من هنا</span><span>© {new Date().getFullYear()} البرازيلي</span></footer>
      <nav className="mobile-bottom-nav" aria-label="تنقل الهاتف">{mobileNav.map(item => { const Icon = item.icon; const active = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon size={19} strokeWidth={active ? 2.3 : 1.7} /><span>{item.label}</span></Link>; })}<button type="button" className={moreIsActive || menuOpen ? "active" : ""} onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen}><MoreHorizontal size={19} /><span>المزيد</span></button></nav>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}

export function SectionHeader({ title, subtitle, href, actionLabel = "عرض الكل" }: { title: string; subtitle?: string; href?: string; actionLabel?: string }) {
  return <div className="section-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{href && <Link href={href} className="text-link">{actionLabel}<span>←</span></Link>}</div>;
}
