import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Check, Clock3, ImagePlus, LoaderCircle, MapPin, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const api = trpc as any;
const cairoDateTime = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo",
  dateStyle: "medium",
  timeStyle: "short",
});
const formatTime = (value?: string | Date | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : cairoDateTime.format(date);
};
const telephoneHref = (value?: string | null) => value ? `tel:${value.replace(/[^\d+]/g, "")}` : undefined;

export default function QrCheckSection() {
  const verify = api.bookings.verifyQr.useMutation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [code, setCode] = useState("");
  const [scanState, setScanState] = useState<"idle" | "starting" | "scanning">("idle");
  const [result, setResult] = useState<any>(null);

  const stopCamera = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanState("idle");
  };

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const verifyCode = async (value = code) => {
    if (!value.trim()) {
      toast.error("أدخل رمز الحجز.");
      return;
    }
    try {
      const payload = JSON.parse(value.trim());
      const bookingId = Number(payload?.bookingId);
      if (!Number.isInteger(bookingId) || bookingId <= 0 || typeof payload?.token !== "string" || payload.token.length < 8) {
        throw new Error("رمز QR غير صالح.");
      }
      const verified = await verify.mutateAsync({ bookingId, token: payload.token });
      setResult(verified);
      setCode("");
      toast.success("تم التحقق من الحجز وعرض بياناته.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "رمز الحجز غير صالح.";
      setResult({ error: message });
      toast.error(message);
    }
  };

  const startCamera = async () => {
    setResult(null);
    setScanState("starting");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setScanState("idle");
      toast.error("افتح التطبيق عبر اتصال HTTPS واسمح للمتصفح باستخدام الكاميرا.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach(track => track.stop());
        setScanState("idle");
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      setScanState("scanning");
      let lastDecodeAt = 0;
      const scanFrame = (timestamp: number) => {
        if (!streamRef.current) return;
        if (timestamp - lastDecodeAt >= 280) {
          lastDecodeAt = timestamp;
          const canvas = canvasRef.current;
          if (canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
            const width = Math.min(video.videoWidth, 960);
            const height = Math.max(1, Math.round(video.videoHeight * width / video.videoWidth));
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context) {
              context.drawImage(video, 0, 0, width, height);
              const image = context.getImageData(0, 0, width, height);
              const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
              if (decoded?.data) {
                stopCamera();
                void verifyCode(decoded.data);
                return;
              }
            }
          }
        }
        frameRef.current = requestAnimationFrame(scanFrame);
      };
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setScanState("idle");
      const name = error instanceof Error ? error.name : "";
      const message = name === "NotAllowedError"
        ? "لم يُسمح باستخدام الكاميرا. فعّل إذن الكاميرا من إعدادات المتصفح ثم أعد المحاولة."
        : name === "NotFoundError"
          ? "لم يتم العثور على كاميرا في هذا الجهاز. استخدم الإدخال اليدوي لرمز QR."
          : "تعذر فتح الكاميرا. تحقق من إذن المتصفح وحاول مرة أخرى.";
      toast.error(message);
    }
  };

  const booking = result?.booking;
  const player = result?.player;
  const pitch = result?.pitch;
  const field = result?.field;
  const schedule = result?.schedule;
  const captain = result?.captain;

  return <section className="panel-card qr-section" id="qr">
    <div className="panel-title"><div><span className="eyebrow">تأكيد الوصول</span><h2>ماسح QR للحجوزات</h2></div><Camera size={19} /></div>
    <p className="panel-intro">امسح رمز اللاعب عند وصوله للملعب أو أدخل نص QR يدوياً. بعد القراءة تظهر كل بيانات الحجز.</p>
    <div className="qr-check-controls">
      <button className="button-outline" onClick={startCamera} disabled={scanState !== "idle"}><Camera size={16} />{scanState === "starting" ? "جارٍ فتح الكاميرا..." : "فتح الكاميرا"}</button>
      <div className="manual-qr"><input value={code} onChange={event => setCode(event.target.value)} placeholder="ألصق نص رمز QR هنا" /><button className="button-primary" onClick={() => void verifyCode()} disabled={verify.isPending}>{verify.isPending ? <LoaderCircle size={16} className="spin" /> : "تحقق"}</button></div>
    </div>
    <div className={`camera-box ${scanState === "scanning" ? "active" : "idle"}`}>
      <video ref={videoRef} muted playsInline autoPlay aria-label="معاينة الكاميرا لمسح رمز QR" />
      <canvas ref={canvasRef} hidden />
      {scanState === "scanning" ? <><span>وجّه الكاميرا إلى رمز QR الخاص بالحجز</span><button className="camera-stop-button" onClick={stopCamera}><X size={15} /> إيقاف الكاميرا</button></> : <span className="camera-placeholder">اضغط «فتح الكاميرا» أو أدخل الرمز يدوياً</span>}
    </div>
    {result?.error && <div className="qr-result error"><X size={16} />{result.error}</div>}
    {result?.valid && booking && <div className="qr-booking-result">
      <div className="qr-result success"><Check size={17} /><b>تم التحقق من الحجز #{booking.id}</b><span className="status-chip approved">{booking.status === "approved" ? "مؤكد" : booking.status}</span></div>
      <div className="qr-booking-grid">
        <section className="qr-detail-card"><h3><UserRound size={15} /> بيانات اللاعب</h3><b>{player?.name || `لاعب #${booking.playerId || player?.id || "—"}`}</b><span>رقم الحساب: {player?.id ? `#${player.id}` : `#${booking.playerId || "—"}`}</span>{player?.phone ? <a href={telephoneHref(player.phone)}>{player.phone}</a> : <span>الهاتف غير متاح</span>}{player?.email && <a href={`mailto:${player.email}`}>{player.email}</a>}{player?.region && <span>{player.region}</span>}</section>
        <section className="qr-detail-card"><h3><MapPin size={15} /> الملعب والملعب الفرعي</h3><b>{pitch?.name || result.pitchName || "ملعب"}</b><span>{field?.name || `ملعب فرعي #${booking.fieldId || "—"}`}</span><span>{[pitch?.address, pitch?.city].filter(Boolean).join("، ") || "العنوان غير متاح"}</span></section>
        <section className="qr-detail-card"><h3><Clock3 size={15} /> موعد اللعب</h3><b>{formatTime(schedule?.startsAt || booking.startsAt)}</b><span>النهاية: {formatTime(schedule?.endsAt || booking.endsAt)}</span><span>سعر الموعد: {schedule?.price ?? booking.price ?? "—"} ج.م</span></section>
        <section className="qr-detail-card"><h3><ImagePlus size={15} /> الدفع والحجز</h3><span>طريقة الدفع: {booking.paymentMethod === "arrival" ? "عند الوصول" : booking.paymentMethod === "full" ? "المبلغ كاملاً" : "العربون"}</span><span>المبلغ: {booking.paymentAmount == null ? "عند الوصول" : `${booking.paymentAmount} ج.م`}</span><span>تاريخ إنشاء الحجز: {formatTime(booking.createdAt)}</span>{booking.receiptUrl ? <a className="booking-receipt-link" href={booking.receiptUrl} target="_blank" rel="noreferrer"><ImagePlus size={13} /> عرض إيصال الدفع</a> : <span>لا يوجد إيصال مطلوب لهذا الحجز</span>}</section>
        <section className="qr-detail-card"><h3><UserRound size={15} /> الكابتن المختار</h3><b>{captain?.name || booking.captainName || "لم يُحدد كابتن"}</b>{(captain?.phone || booking.captainPhone) ? <a href={telephoneHref(captain?.phone || booking.captainPhone)}>{captain?.phone || booking.captainPhone}</a> : <span>لا يوجد رقم مسجل</span>}</section>
      </div>
    </div>}
  </section>;
}
