import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  BadgeCheck, Bell, BellOff, FileText, Image as ImageIcon, LoaderCircle,
  MessageCircle, Pause, Phone, Play, Search, Video, Volume2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏"] as const;

export function readChatMutePreference(key: string) {
  try { return typeof window !== "undefined" && window.localStorage.getItem(key) === "true"; }
  catch { return false; }
}

export function writeChatMutePreference(key: string, muted: boolean) {
  try { if (typeof window !== "undefined") window.localStorage.setItem(key, String(muted)); }
  catch { /* The preference remains session-local when storage is unavailable. */ }
}

type ChatMessageLike = {
  id?: number;
  messageType?: string;
  body?: string | null;
  content?: string | null;
  fileName?: string | null;
  senderName?: string | null;
  createdAt?: string | Date | null;
};

type SupportProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessageLike[];
  muted: boolean;
  onToggleMuted: () => void;
  onCall: (kind: "audio" | "video") => void;
  onJumpToMessage: (messageId: number) => void;
  profile?: { name?: string | null; email?: string | null; phone?: string | null; avatarUrl?: string | null; isOnline?: boolean } | null;
};

function messageLabel(message: ChatMessageLike) {
  if (message.messageType === "voice") return "رسالة صوتية";
  if (message.messageType === "image") return message.fileName || "صورة";
  if (message.messageType === "video") return message.fileName || "فيديو";
  if (message.messageType === "file") return message.fileName || "مستند";
  return String(message.body || message.content || "رسالة نصية");
}

export function SupportProfileDialog({
  open,
  onOpenChange,
  messages,
  muted,
  onToggleMuted,
  onCall,
  onJumpToMessage,
  profile,
}: SupportProfileDialogProps) {
  const [search, setSearch] = useState("");
  const media = useMemo(
    () => messages.filter(message => ["image", "video", "file", "voice"].includes(message.messageType || "")),
    [messages],
  );
  const matches = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return [];
    return messages.filter(message => messageLabel(message).toLocaleLowerCase().includes(term)).reverse();
  }, [messages, search]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="chat-profile-dialog" showCloseButton>
        <div className="chat-profile-cover" aria-hidden="true"><span className="chat-profile-orbit" /></div>
        <div className="chat-profile-main">
          <div className="chat-profile-avatar">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <img src="/brzly-logo.svg" alt="" />}</div>
          <div className="chat-profile-title">
            <DialogTitle>{profile?.name || "إدارة البرازيلي والدعم"} {!profile && <BadgeCheck size={19} aria-label="حساب موثّق" />}</DialogTitle>
            <DialogDescription>{profile ? <>{profile.isOnline && <span className="chat-online-dot" />} {profile.email || profile.phone || "ملف العميل"}</> : <><span className="chat-online-dot" /> متصل الآن · فريق الدعم الرسمي</>}</DialogDescription>
          </div>
        </div>

        <div className="chat-profile-actions" aria-label="إجراءات المحادثة">
          <button type="button" onClick={() => onCall("audio")}><Phone size={18} /><span>صوتي</span></button>
          <button type="button" onClick={() => onCall("video")}><Video size={18} /><span>فيديو</span></button>
          <button type="button" onClick={onToggleMuted} aria-pressed={muted}><span className="chat-profile-action-icon">{muted ? <BellOff size={18} /> : <Bell size={18} />}</span><span>{muted ? "إلغاء الكتم" : "كتم"}</span></button>
        </div>

        <label className="chat-profile-search">
          <Search size={17} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث في المحادثة" aria-label="البحث في المحادثة" />
        </label>

        {search.trim() ? (
          <section className="chat-profile-section" aria-label="نتائج البحث">
            <h3>نتائج البحث <span>{matches.length}</span></h3>
            {matches.length ? matches.map((message, index) => (
              <button type="button" className="chat-profile-list-item" key={message.id ?? index} onClick={() => message.id && onJumpToMessage(message.id)}>
                <span className="chat-profile-list-icon"><Search size={15} /></span>
                <span><b>{message.senderName || "رسالة"}</b><small>{messageLabel(message)}</small></span>
              </button>
            )) : <p className="chat-profile-empty">لا توجد رسائل مطابقة.</p>}
          </section>
        ) : (
          <section className="chat-profile-section" aria-label="الوسائط والمستندات المتبادلة">
            <h3>الوسائط والمستندات <span>{media.length}</span></h3>
            {media.length ? media.slice().reverse().map((message, index) => {
              const Icon = message.messageType === "image" || message.messageType === "video" ? ImageIcon : message.messageType === "voice" ? Volume2 : FileText;
              return (
                <button type="button" className="chat-profile-list-item" key={message.id ?? index} onClick={() => message.id && onJumpToMessage(message.id)}>
                  <span className="chat-profile-list-icon"><Icon size={16} /></span>
                  <span><b>{messageLabel(message)}</b><small>{message.senderName || "مشارك في المحادثة"}</small></span>
                  <MessageCircle size={14} className="chat-profile-jump" />
                </button>
              );
            }) : <p className="chat-profile-empty">ستظهر الملفات والصور المتبادلة هنا.</p>}
          </section>
        )}

        <button type="button" className="chat-profile-notification-setting" onClick={onToggleMuted} aria-pressed={muted}>
          <span className="chat-profile-notification-icon">{muted ? <BellOff size={17} /> : <Bell size={17} />}</span>
          <span><b>إعدادات التنبيهات</b><small>{muted ? "التنبيهات مكتومة على هذا الجهاز" : "التنبيهات مفعّلة على هذا الجهاز"}</small></span>
          <span className={`chat-toggle ${muted ? "is-muted" : ""}`} aria-hidden="true"><i /></span>
        </button>
      </DialogContent>
    </Dialog>
  );
}

type WaveformPlayerProps = {
  src?: string;
  durationSeconds?: number | null;
  previewSimulation?: boolean;
  loading?: boolean;
  onRequestSource?: () => Promise<void>;
  label?: string;
};

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function WaveformPlayer({
  src,
  durationSeconds = 12,
  previewSimulation = false,
  loading = false,
  onRequestSource,
  label = "رسالة صوتية",
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayAfterLoad = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioTime, setAudioTime] = useState(0);
  const [demoProgress, setDemoProgress] = useState(0);
  const bars = useMemo(() => Array.from({ length: 34 }, (_, index) => {
    const value = Math.abs(Math.sin(index * 1.73) * 23 + Math.cos(index * 0.61) * 17 + 43);
    return Math.max(18, Math.min(96, Math.round(value)));
  }), []);
  const duration = previewSimulation ? (durationSeconds || 12) : (audioDuration || durationSeconds || 12);
  const progress = previewSimulation ? demoProgress : (audioDuration > 0 ? audioTime / audioDuration : 0);
  const currentTime = previewSimulation ? duration * demoProgress : audioTime;

  useEffect(() => {
    if (!previewSimulation || !playing) return;
    const timer = window.setInterval(() => setDemoProgress(value => Math.min(1, value + 0.025)), 180);
    return () => window.clearInterval(timer);
  }, [previewSimulation, playing]);

  useEffect(() => {
    if (previewSimulation && demoProgress >= 1) setPlaying(false);
  }, [demoProgress, previewSimulation]);

  useEffect(() => {
    if (!src || !autoplayAfterLoad.current || !audioRef.current) return;
    autoplayAfterLoad.current = false;
    void audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [src]);

  const togglePlayback = async () => {
    if (previewSimulation) {
      if (playing) setPlaying(false);
      else {
        if (demoProgress >= 1) setDemoProgress(0);
        setPlaying(true);
      }
      return;
    }
    if (!src) {
      if (loading || !onRequestSource) return;
      autoplayAfterLoad.current = true;
      try { await onRequestSource(); } catch { autoplayAfterLoad.current = false; }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); setPlaying(true); }
      catch { setPlaying(false); }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    if (previewSimulation) setDemoProgress(fraction);
    else if (audioRef.current && audioDuration > 0) audioRef.current.currentTime = fraction * audioDuration;
  };

  const seekByKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (previewSimulation) setDemoProgress(value => Math.max(0, Math.min(1, value + direction * 0.04)));
    else if (audioRef.current && audioDuration > 0) audioRef.current.currentTime = Math.max(0, Math.min(audioDuration, audioRef.current.currentTime + direction * 2));
  };

  return (
    <div className={`chat-wave-player${playing ? " is-playing" : ""}${previewSimulation ? " is-demo" : ""}`} aria-label={label}>
      {!previewSimulation && src && <audio
        ref={audioRef}
        className="chat-wave-audio"
        preload="metadata"
        src={src}
        aria-label={label}
        onLoadedMetadata={event => setAudioDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : duration)}
        onTimeUpdate={event => setAudioTime(event.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setAudioTime(audioDuration); }}
        onError={() => { setPlaying(false); setAudioTime(0); }}
      />}
      <button type="button" className="chat-wave-play" onClick={() => void togglePlayback()} disabled={loading} aria-label={playing ? "إيقاف الرسالة الصوتية" : loading ? "جارٍ تحميل الرسالة الصوتية" : "تشغيل الرسالة الصوتية"}>
        {loading ? <LoaderCircle size={17} className="spin" /> : playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>
      <div className="chat-wave-body">
        <button
          type="button"
          className="chat-wave-track"
          onClick={seek}
          onKeyDown={seekByKeyboard}
          role="slider"
          aria-label="التقدم في الرسالة الصوتية"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.max(0, Math.min(1, progress)) * 100)}
        >
          {bars.map((height, index) => <span key={index} className={index / bars.length <= progress ? "is-played" : ""} style={{ height: `${height}%` }} />)}
        </button>
        <div className="chat-wave-meta"><small>{formatTime(currentTime)}</small><small>{formatTime(duration)}</small></div>
      </div>
      {previewSimulation && <span className="chat-wave-demo-label">تجريبي</span>}
    </div>
  );
}

type QuickEmojiPickerProps = { onSelect: (emoji: string) => void; label?: string };

export function QuickEmojiPicker({ onSelect, label = "إدراج إيموجي" }: QuickEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="chat-emoji-picker-wrap">
      <button type="button" className="chat-compose-icon-button" aria-label={label} aria-expanded={open} onClick={() => setOpen(value => !value)}><span className="chat-emoji-glyph">☺</span></button>
      {open && <div className="chat-emoji-menu" role="menu" aria-label="التفاعلات السريعة">
        {QUICK_REACTIONS.map(emoji => <button type="button" role="menuitem" key={emoji} onClick={() => { onSelect(emoji); setOpen(false); }} aria-label={`إدراج ${emoji}`}>{emoji}</button>)}
      </div>}
    </div>
  );
}

export function MessageReadReceipt({ read }: { read: boolean }) {
  return <span className={`chat-read-receipt${read ? " is-read" : ""}`} title={read ? "تمت القراءة" : "تم الإرسال"} aria-label={read ? "تمت القراءة" : "تم الإرسال"}>{read ? <span aria-hidden="true">✓✓</span> : <span aria-hidden="true">✓</span>}</span>;
}
