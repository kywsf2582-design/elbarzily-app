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
      toast.success("اقتراحك وصل للإدارة، وهيراجعوه قريب.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ماقدرناش نبعت الاقتراح، جرّب تاني.");
    }
  };

  return <>
    <PageHeading eyebrow="ساعدنا نكبر الشبكة" title="اقترح ملعب" description="ابعت بيانات الملعب للإدارة، وهيراجعوها قبل ما يضيفوه للمنصة." action={<button className="button-outline compact-button" onClick={() => setLocation("/settings")}>إعدادات حسابك <ArrowLeft size={15} /></button>} />
    <section className="panel-card suggestion-form-card">
      <div className="panel-title"><div><span className="eyebrow">اقتراح للمجتمع</span><h2>ملعب جديد جنبك</h2></div><MapPin size={19} /></div>
      {user ? <form className="owner-form" onSubmit={submit}>
        <label className="form-field"><span>اسم الملعب</span><input value={name} onChange={event => setName(event.target.value)} placeholder="اسم الملعب اللي بتقترحه" maxLength={180} required /></label>
        <div className="two-fields"><label className="form-field"><span>العنوان</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder="المنطقة والشارع" maxLength={320} required /></label><label className="form-field"><span>المدينة أو المحافظة</span><input value={city} onChange={event => setCity(event.target.value)} placeholder="القاهرة" maxLength={120} required /></label></div>
        <label className="form-field"><span>تفاصيل زيادة</span><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} placeholder="أي تفاصيل تساعد الإدارة تراجعه أسرع" /></label>
        <button className="button-primary" disabled={sendSuggestion.isPending}>{sendSuggestion.isPending ? "بنبعت..." : <><Send size={16} /> ابعت الاقتراح للمراجعة</>}</button>
        <p className="review-note suggestion-review-note">فريق الإدارة هيراجع اقتراحك ويتواصل مع الملعب.</p>
      </form> : <div className="profile-signin-note"><p>سجّل دخولك عشان تقترح ملعب جديد.</p><button className="button-primary" onClick={() => setLocation("/join")}>سجّل دخولك <ArrowLeft size={15} /></button></div>}
    </section>
  </>;
}
