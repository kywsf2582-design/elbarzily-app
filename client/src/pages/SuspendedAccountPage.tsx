import { useState } from "react";
import { LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/features/app/AppShell";
import { trpc } from "@/lib/trpc";

type SuspendedUser = { name?: string | null; accountType?: string; role?: string };
const api = trpc as any;

export default function SuspendedAccountPage({ user }: { user: SuspendedUser }) {
  const utils = trpc.useUtils();
  const logout = api.auth.logout.useMutation();
  const [refreshing, setRefreshing] = useState(false);
  const owner = user.accountType === "owner" || user.role === "owner";

  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      await utils.auth.me.invalidate();
      toast.message("تم تحديث حالة الحساب.");
    } finally {
      setRefreshing(false);
    }
  };

  const signOut = async () => {
    try { await logout.mutateAsync(); } finally { window.location.assign("/join"); }
  };

  return <>
    <PageHeading eyebrow="حالة الحساب" title="الوصول موقوف مؤقتاً" description="تعذر تحميل صفحات الحساب أثناء الإيقاف." />
    <section className="panel-card suspended-account-card">
      <span className="suspended-account-icon"><ShieldAlert size={25} /></span>
      <h2>{owner ? "تم إيقاف اشتراك الملعب" : "تم إيقاف الحساب"}</h2>
      <p>{user.name ? `${user.name}، ` : ""}أوقفت الإدارة صلاحيات الحساب مؤقتاً. {owner ? "لن تتاح لوحة تحكم الملعب أو إجراءاته حتى إعادة تفعيل الاشتراك." : "لن تتاح الإجراءات المحمية حتى إعادة تفعيل الحساب."} بعد التفعيل اضغط «تحقق من الحالة» أو سجّل الدخول مرة أخرى.</p>
      <div className="suspended-account-actions"><button className="button-primary" onClick={refreshStatus} disabled={refreshing}>{refreshing ? <RefreshCw size={16} className="spin" /> : <RefreshCw size={16} />} تحقق من الحالة</button><button className="button-outline" onClick={signOut}><LogOut size={16} /> تسجيل الخروج</button></div>
    </section>
  </>;
}
