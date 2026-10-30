import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, MapPin, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/features/app/AppShell";
import { trpc } from "@/lib/trpc";

type AccountUser = { id: number };
const api = trpc as any;

export default function PitchSuggestionPage({ user }: { user: AccountUser | null }) {
  const [, setLocation] = useLocation();
  const sendSuggestion = api.suggestions.create.useMutation();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setLocation("/join");
      return;
    }
    try {
      await sendSuggestion.mutateAsync({
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        notes: notes.trim() || undefined,
      });
      setName("");
      setAddress("");
      setCity("");
      setNotes("");
      toast.success("وصل اقتراح الملعب إلى الإدارة.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال الاقتراح.");
    }
  };

  return <>
    <PageHeading eyebrow="ساعدنا نوسّع الشبكة" title="اقتراح ملعب" description="أرسل بيانات الملعب للإدارة لمراجعته وإضافته للمنصة." action={<button className="button-outline compact-button" onClick={() => setLocation("/settings")}>إعدادات الحساب <ArrowLeft size={15} /></button>} />
    <section className="panel-card suggestion-form-card">
      <div className="panel-title"><div><span className="eyebrow">اقتراح للمجتمع</span><h2>ملعب جديد قريب منك</h2></div><MapPin size={19} /></div>
      {user ? <form className="owner-form" onSubmit={submit}>
        <label className="form-field"><span>اسم الملعب</span><input value={name} onChange={event => setName(event.target.value)} placeholder="اسم الملعب المقترح" maxLength={180} required /></label>
        <div className="two-fields"><label className="form-field"><span>العنوان</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder="الحي والشارع" maxLength={320} required /></label><label className="form-field"><span>المدينة أو المحافظة</span><input value={city} onChange={event => setCity(event.target.value)} placeholder="القاهرة" maxLength={120} required /></label></div>
        <label className="form-field"><span>معلومات إضافية</span><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} placeholder="أي معلومات تساعد الإدارة" /></label>
        <button className="button-primary" disabled={sendSuggestion.isPending}>{sendSuggestion.isPending ? "جارٍ الإرسال..." : <><Send size={16} /> إرسال الاقتراح للمراجعة</>}</button>
        <p className="review-note suggestion-review-note">سيظهر اقتراحك لفريق الإدارة لمراجعته والتواصل مع الملعب.</p>
      </form> : <div className="profile-signin-note"><p>سجّل الدخول لإرسال اقتراح ملعب جديد.</p><button className="button-primary" onClick={() => setLocation("/join")}>تسجيل الدخول <ArrowLeft size={15} /></button></div>}
    </section>
  </>;
}
