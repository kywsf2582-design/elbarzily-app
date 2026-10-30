import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  BadgeCheck, FileText, MessageCircle, MessageSquareText, Mic, Paperclip,
  Shield, ShieldCheck, Smile, X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/features/app/AppShell";
import {
  MessageReadReceipt, QUICK_REACTIONS, QuickEmojiPicker,
  readChatMutePreference, SupportProfileDialog, WaveformPlayer, writeChatMutePreference,
} from "./ChatPresentation";

type DemoMessage = Record<string, any>;
const SUPPORT_NAME = "إدارة البرازيلي والدعم";
const PREVIEW_MUTE_KEY = "elbarzily:chat-preview-muted";

function messageText(item: DemoMessage) {
  if (item.messageType === "voice") return "رسالة صوتية";
  if (item.messageType === "image") return item.fileName || "صورة";
  if (item.messageType === "video") return item.fileName || "فيديو";
  if (item.messageType === "file") return item.fileName || "مستند";
  return item.body || "رسالة";
}

export default function ChatPreviewPanel() {
  const [replyingTo, setReplyingTo] = useState<DemoMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [profileOpen, setProfileOpen] = useState(() => new URLSearchParams(window.location.search).get("profile") === "1");
  const [reactionTarget, setReactionTarget] = useState<number | null>(null);
  const [notificationsMuted, setNotificationsMuted] = useState(() => readChatMutePreference(PREVIEW_MUTE_KEY));
  const [demoRecording, setDemoRecording] = useState(false);
  const [items, setItems] = useState<DemoMessage[]>([
    { id: 101, senderId: 24, senderName: SUPPORT_NAME, messageType: "text", body: "أهلاً بك في دعم البرازيلي، كيف نقدر نساعدك؟", createdAt: new Date(Date.now() - 24 * 60_000), reactions: [{ emoji: "🙏" }] },
    { id: 102, senderId: 7, senderName: "أنت", messageType: "text", body: "ممكن تساعدوني في تعديل موعد الحجز؟", createdAt: new Date(Date.now() - 17 * 60_000), quotedMessage: { id: 101, senderName: SUPPORT_NAME, messageType: "text", body: "أهلاً بك في دعم البرازيلي، كيف نقدر نساعدك؟" }, reactions: [{ emoji: "❤️" }], isRead: true },
    { id: 103, senderId: 24, senderName: SUPPORT_NAME, messageType: "voice", body: "", durationSeconds: 12, createdAt: new Date(Date.now() - 9 * 60_000), reactions: [] },
    { id: 104, senderId: 7, senderName: "أنت", messageType: "file", fileName: "تفاصيل الحجز.pdf", createdAt: new Date(Date.now() - 4 * 60_000), reactions: [], isRead: true },
  ]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const replyTimerRef = useRef<number | null>(null);
  const demoRecordingTimerRef = useRef<number | null>(null);
  const quoteLabel = (item: DemoMessage) => messageText(item);

  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 132)}px`;
  }, [draft]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length]);

  useEffect(() => () => {
    if (replyTimerRef.current) window.clearTimeout(replyTimerRef.current);
    if (demoRecordingTimerRef.current) window.clearTimeout(demoRecordingTimerRef.current);
  }, []);

  const addReaction = (messageId: number, emoji: string) => {
    setItems(current => current.map(item => item.id === messageId
      ? { ...item, reactions: [...(item.reactions || []), { emoji }] }
      : item));
    setReactionTarget(null);
  };

  const sendPreview = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const now = Date.now();
    setItems(current => [...current, {
      id: now,
      senderId: 7,
      senderName: "أنت",
      messageType: "text",
      body,
      createdAt: new Date(),
      reactions: [],
      isRead: true,
      quotedMessage: replyingTo ? { id: replyingTo.id, senderName: replyingTo.senderName, messageType: replyingTo.messageType, body: replyingTo.body, fileName: replyingTo.fileName } : null,
    }]);
    setDraft("");
    setReplyingTo(null);
    replyTimerRef.current = window.setTimeout(() => setItems(current => [...current, {
      id: now + 1,
      senderId: 24,
      senderName: SUPPORT_NAME,
      messageType: "text",
      body: "وصلت رسالتك إلى فريق الدعم. هذا رد آلي تجريبي للمعاينة، وسيتابع الفريق طلبك في المحادثة الفعلية.",
      createdAt: new Date(),
      reactions: [],
      isAutoReply: true,
    }]), 720);
  };

  const insertEmoji = (emoji: string) => {
    const field = textareaRef.current;
    if (!field) { setDraft(current => `${current}${emoji}`); return; }
    const start = field.selectionStart ?? draft.length;
    const end = field.selectionEnd ?? start;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const attachFile = (file?: File) => {
    if (!file) return;
    const messageType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
    setItems(current => [...current, {
      id: Date.now(),
      senderId: 7,
      senderName: "أنت",
      messageType,
      fileName: file.name,
      body: file.name,
      createdAt: new Date(),
      reactions: [],
      isRead: true,
    }]);
  };

  const toggleDemoRecording = () => {
    if (demoRecording) {
      if (demoRecordingTimerRef.current) window.clearTimeout(demoRecordingTimerRef.current);
      demoRecordingTimerRef.current = null;
      setDemoRecording(false);
      setItems(current => [...current, { id: Date.now(), senderId: 7, senderName: "أنت", messageType: "voice", durationSeconds: 3, createdAt: new Date(), reactions: [], isRead: true }]);
      return;
    }
    setDemoRecording(true);
    demoRecordingTimerRef.current = window.setTimeout(() => { setDemoRecording(false); demoRecordingTimerRef.current = null; }, 8_000);
    toast.info("تسجيل تجريبي للمعاينة فقط؛ التسجيل الحقيقي متاح داخل المحادثة الفعلية.");
  };

  const toggleNotificationsMuted = () => setNotificationsMuted(current => {
    const next = !current;
    writeChatMutePreference(PREVIEW_MUTE_KEY, next);
    return next;
  });

  const jumpToMessage = (messageId: number) => {
    setProfileOpen(false);
    window.setTimeout(() => document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  return (
    <div className="chat-page-shell chat-preview-page">
      <div className="chat-page-heading"><PageHeading eyebrow="معاينة تفاعلية · بيانات تجريبية" title="الشات" description="جرّب الملف والتفاعلات والإرسال هنا؛ لا تُحفظ هذه الرسائل." /></div>
      <div className="chat-layout chat-preview-layout">
        <aside className="chat-rooms" aria-label="قائمة المحادثات">
          <button className="chat-room active support-pinned" type="button" onClick={() => setProfileOpen(true)}>
            <span className="room-avatar"><ShieldCheck size={18} /></span>
            <span><b>{SUPPORT_NAME}<em className="chat-pinned-label">مثبت</em></b><small><i className="chat-online-dot" /> متصل الآن</small></span>
          </button>
          <button className="chat-room" type="button" onClick={() => toast.info("تُعرض غرفة الدعم في هذه المعاينة التفاعلية.")}>
            <span className="room-avatar">أ</span><span><b>أحمد محمود</b><small>مباراة الجمعة · ٨ مساءً</small></span>
          </button>
        </aside>

        <section className="chat-conversation" aria-label={`محادثة ${SUPPORT_NAME}`}>
          <div className="chat-conversation-head">
            <button type="button" className="chat-header-avatar" onClick={() => setProfileOpen(true)} aria-label="فتح ملف إدارة البرازيلي والدعم">
              <img src="/brzly-logo.svg" alt="" />
            </button>
            <button type="button" className="chat-header-info" onClick={() => setProfileOpen(true)}>
              <span className="chat-title-line"><b>{SUPPORT_NAME}</b><BadgeCheck size={18} aria-label="حساب موثّق" /></span>
              <small><i className="chat-online-dot" /> متصل الآن</small>
            </button>
            <button type="button" className="chat-header-action" onClick={() => setProfileOpen(true)} aria-label="خيارات المحادثة"><Shield size={17} /></button>
          </div>

          <div className="chat-messages" aria-live="polite">
            {items.map(item => {
              const mine = item.senderId === 7;
              const reactions = Object.entries((item.reactions || []).reduce((counts: Record<string, number>, reaction: DemoMessage) => {
                counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
                return counts;
              }, {}));
              return (
                <article id={`chat-message-${item.id}`} key={item.id} className={`chat-bubble ${mine ? "mine" : ""}`}>
                  <button type="button" className="chat-sender" onClick={() => setProfileOpen(true)}>
                    <span className="chat-sender-avatar">{mine ? "أ" : <img src="/brzly-logo.svg" alt="" />}</span>
                    <b>{item.senderName}</b>
                    {!mine && <BadgeCheck size={14} className="chat-sender-verified" aria-label="حساب موثّق" />}
                  </button>
                  {item.quotedMessage && <button type="button" className="chat-quoted-message" onClick={() => jumpToMessage(item.quotedMessage.id)}>
                    <b>{item.quotedMessage.senderName}</b><span>{quoteLabel(item.quotedMessage)}</span>
                  </button>}
                  {item.messageType === "voice" ? <WaveformPlayer previewSimulation durationSeconds={item.durationSeconds || 12} label="رسالة صوتية تجريبية" />
                    : item.messageType === "text" ? <p>{item.body}</p>
                      : <div className="chat-demo-attachment"><FileText size={18} /><span><b>{item.fileName || "ملف مرفق"}</b><small>مرفق تجريبي · لا يُرفع في وضع المعاينة</small></span></div>}
                  {item.isAutoReply && <span className="chat-auto-reply-label">رد آلي تجريبي</span>}
                  {reactions.length > 0 && <div className="chat-reactions">{reactions.map(([emoji, count]) => <button type="button" key={emoji} onClick={() => addReaction(item.id, emoji)}>{emoji} {String(count)}</button>)}</div>}
                  <div className="chat-message-meta"><small>{new Date(item.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</small>{mine && <MessageReadReceipt read={Boolean(item.isRead)} />}</div>
                  <div className="chat-message-actions">
                    <button type="button" onClick={() => { setReplyingTo(item); textareaRef.current?.focus(); }}><MessageSquareText size={14} /> رد</button>
                    <button type="button" onClick={() => setReactionTarget(reactionTarget === item.id ? null : item.id)} aria-expanded={reactionTarget === item.id}><Smile size={14} /> تفاعل</button>
                  </div>
                  {reactionTarget === item.id && <div className="chat-reaction-picker" aria-label="اختر تفاعلاً">{QUICK_REACTIONS.map(emoji => <button type="button" key={emoji} onClick={() => addReaction(item.id, emoji)} aria-label={`تفاعل ${emoji}`}>{emoji}</button>)}</div>}
                </article>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <form className={`chat-compose${replyingTo ? " is-replying" : ""}${demoRecording ? " is-recording" : ""}`} onSubmit={sendPreview}>
            {replyingTo && <div className="chat-reply-preview"><span><b>الرد على {replyingTo.senderName}</b><small>{quoteLabel(replyingTo)}</small></span><button type="button" aria-label="إلغاء الرد" onClick={() => setReplyingTo(null)}><X size={15} /></button></div>}
            <div className="chat-compose-row">
              <label className="chat-attach-button" title="إرفاق صورة أو ملف" aria-label="إرفاق صورة أو ملف"><Paperclip size={18} /><input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={event => { attachFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
              <QuickEmojiPicker onSelect={insertEmoji} />
              <textarea ref={textareaRef} value={draft} rows={1} onChange={event => setDraft(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={replyingTo ? `الرد على ${replyingTo.senderName}...` : "اكتب رسالتك..."} aria-label="نص الرسالة" />
              {draft.trim() ? <button type="submit" className="chat-compose-send" aria-label="إرسال الرسالة"><span className="send-arrow">↑</span></button>
                : <button type="button" className={`chat-compose-send chat-compose-mic${demoRecording ? " is-recording" : ""}`} onClick={toggleDemoRecording} aria-label={demoRecording ? "إيقاف التسجيل التجريبي" : "تسجيل رسالة صوتية تجريبية"}><Mic size={18} /></button>}
            </div>
          </form>
        </section>
      </div>
      <p className="chat-preview-disclaimer">وضع معاينة فقط — لا تُحفظ الرسائل أو الملفات أو التفاعلات.</p>
      <SupportProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        messages={items}
        muted={notificationsMuted}
        onToggleMuted={toggleNotificationsMuted}
        onCall={kind => toast.info(kind === "audio" ? "الاتصال الصوتي غير مفعّل في وضع المعاينة." : "مكالمة الفيديو غير مفعّلة في وضع المعاينة.")}
        onJumpToMessage={jumpToMessage}
      />
    </div>
  );
}
