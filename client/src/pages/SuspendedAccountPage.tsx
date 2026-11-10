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
      toast.message("حدّثنا حالة حسابك.");
    } finally {
      setRefreshing(false);
    }
  };

  const signOut = async () => {
    try { await logout.mutateAsync(); } finally { window.location.assign("/join"); }
  };

  return <>
    <PageHeading eyebrow="حالة حسابك" title="حسابك موقوف مؤقتاً" description="مش هتقدر تفتح صفحات الحساب طول فترة الإيقاف." />
    <section className="panel-card suspended-account-card">
      <span className="suspended-account-icon"><ShieldAlert size={25} /></span>
      <h2>{owner ? "اشتراك الملعب موقوف" : "الحساب موقوف"}</h2>
      <p>{user.name ? `${user.name}، ` : ""}الإدارة وقفت صلاحيات الحساب مؤقتاً. {owner ? "مش هتقدر تستخدم لوحة الملعب أو خدماتها لحد ما الاشتراك يتفعّل تاني." : "مش هتقدر تستخدم الخدمات المحمية لحد ما الحساب يتفعّل تاني."} لما الحساب يتفعّل، دوس «اتأكد من الحالة» أو سجّل دخولك من جديد.</p>
      <div className="suspended-account-actions"><button className="button-primary" onClick={refreshStatus} disabled={refreshing}>{refreshing ? <RefreshCw size={16} className="spin" /> : <RefreshCw size={16} />} اتأكد من الحالة</button><button className="button-outline" onClick={signOut}><LogOut size={16} /> سجّل خروجك</button></div>
    </section>
  </>;
}
