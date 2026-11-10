import { useEffect, useRef, useState, type ReactNode } from "react";
import jsQR from "jsqr";
import { Camera, Check, LoaderCircle, QrCode, X } from "lucide-react";

type VerifyResult = { valid?: boolean; booking?: any; player?: any; pitch?: any; field?: any; schedule?: any; error?: string };
type RewardResult = { id?: number; rewardName?: string; rewardDescription?: string; playerName?: string; issuedAt?: string; expiresAt?: string | null; status?: string; canConfirm?: boolean; authorizedType?: string; authorizedPitchId?: number | null; authorizedPitch?: { name?: string; address?: string; city?: string; ownerName?: string } | null; error?: string };

export default function AdminQrScanner({ verifyBooking, verifyReward, confirmReward }: { verifyBooking: (input: { bookingId: number; token: string }) => Promise<VerifyResult>; verifyReward: (token: string) => Promise<RewardResult>; confirmReward: (input: { redemptionId: number; note?: string }) => Promise<any> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastDecodeRef = useRef(0);
  const [state, setState] = useState<"idle" | "starting" | "scanning">("idle");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [rewardResult, setRewardResult] = useState<RewardResult | null>(null);
  const [busy, setBusy] = useState(false);

  const stopCamera = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
  };

  useEffect(() => () => stopCamera(), []);

  const verifyCode = async (value = code) => {
    const raw = value.trim();
    if (!raw) { setRewardResult({ error: "امسح QR أو اكتب الرمز الأول." }); return; }
    setBusy(true); setResult(null); setRewardResult(null);
    try {
      try {
        const payload = JSON.parse(raw);
        const bookingId = Number(payload?.bookingId);
        if (!Number.isInteger(bookingId) || bookingId <= 0 || typeof payload?.token !== "string" || payload.token.length < 8) throw new Error("رمز QR مش صالح.");
        setResult(await verifyBooking({ bookingId, token: payload.token }));
      } catch (parseError: any) {
        if (parseError instanceof SyntaxError) setRewardResult(await verifyReward(raw));
        else throw parseError;
      }
      setCode("");
    } catch (error: any) {
      if (raw.startsWith("BRZ-") || !raw.startsWith("{")) setRewardResult({ error: error?.message || "القسيمة مش موجودة أو الرمز غلط." });
      else setResult({ error: error?.message || "رمز الحجز مش صالح." });
    } finally { setBusy(false); }
  };

  const startCamera = async () => {
    if (state !== "idle") return;
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error("الكاميرا مش جاهزة.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setState("scanning");
      const scanFrame = (timestamp: number) => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;
        if (timestamp - lastDecodeRef.current >= 280) {
          lastDecodeRef.current = timestamp;
          const canvas = canvasRef.current;
          if (canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
            const width = Math.min(video.videoWidth, 960);
            const height = Math.max(1, Math.round(video.videoHeight * width / video.videoWidth));
            canvas.width = width; canvas.height = height;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context) {
              context.drawImage(video, 0, 0, width, height);
              const image = context.getImageData(0, 0, width, height);
              const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
              if (decoded?.data) { stopCamera(); void verifyCode(decoded.data); return; }
            }
          }
        }
        frameRef.current = requestAnimationFrame(scanFrame);
      };
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (error: any) {
      stopCamera();
      setResult({ error: error?.name === "NotAllowedError" ? "فعّل إذن الكاميرا من إعدادات المتصفح وجرّب تاني." : "مش قادرين نفتح الكاميرا. اكتب رمز QR يدويًا." });
    }
  };

  const booking = result?.booking;
  const reward = rewardResult && !rewardResult.error ? rewardResult : null;
  const confirmVoucher = async () => { if (!reward?.id) return; setBusy(true); try { await confirmReward({ redemptionId: Number(reward.id) }); setRewardResult({ ...reward, status: "used", canConfirm: false }); } catch (error: any) { setRewardResult({ ...reward, error: error?.message || "ماقدرناش نأكد استلام الجائزة." }); } finally { setBusy(false); } };
  return <Panel eyebrow="تأكيد الدخول" title="ماسح QR للإدارة"><p className="muted">امسح QR الحجز للتحقق من الحجز وتسجيل الدخول، أو اكتب نص QR يدويًا.</p><div className="qr-check-controls"><button className="outline-button" type="button" onClick={() => void startCamera()} disabled={state !== "idle" || busy}><Camera size={15} />{state === "starting" ? "جاري فتح الكاميرا…" : "افتح كاميرا الإدارة"}</button><div className="manual-qr"><input value={code} onChange={event => setCode(event.target.value)} placeholder="الصق نص QR هنا" /><button className="approve-button" type="button" onClick={() => void verifyCode()} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : "تحقق"}</button></div></div><div className={`camera-box ${state === "scanning" ? "active" : "idle"}`}><video ref={videoRef} muted playsInline autoPlay aria-label="كاميرا الإدارة لمسح QR" /><canvas ref={canvasRef} hidden />{state === "scanning" ? <><span>وجّه الكاميرا على QR الحجز</span><button className="camera-stop-button" type="button" onClick={stopCamera}><X size={14} /> إيقاف</button></> : <span className="camera-placeholder"><QrCode size={24} /> اضغط فتح الكاميرا أو اكتب الرمز</span>}</div>{result?.error && <div className="notice error-box"><X size={15} /> {result.error}</div>}{result?.valid && booking && <div className="record qr-admin-result"><div><b><Check size={15} /> الحجز اتأكد #{booking.id}</b><small>اللاعب: {result.player?.name || `#${booking.playerId || "—"}`}</small><small>الملعب: {result.pitch?.name || "—"} · الملعب الفرعي: {result.field?.name || "—"}</small><small>الموعد: {result.schedule?.startsAt ? new Date(result.schedule.startsAt).toLocaleString("ar-EG") : "—"}</small></div></div>}{rewardResult?.error && <div className="notice error-box"><X size={15} /> {rewardResult.error}</div>}{reward && <div className="record qr-admin-result"><div><b><Check size={15} /> قسيمة جائزة · {reward.status === "valid" ? "صالحة" : reward.status === "used" ? "اتسلّمت قبل كده" : reward.status}</b><small>الجائزة: {reward.rewardName || "—"}</small><small>اللاعب: {reward.playerName || "—"}</small><small>صدرت: {reward.issuedAt ? new Date(reward.issuedAt).toLocaleString("ar-EG") : "—"} · تنتهي: {reward.expiresAt ? new Date(reward.expiresAt).toLocaleString("ar-EG") : "من غير انتهاء"}</small><small>الجهة المحددة: {reward.authorizedType === "pitch_owner" ? `${reward.authorizedPitch?.ownerName || "صاحب الملعب"} · ${reward.authorizedPitch?.name || `ملعب #${reward.authorizedPitchId || "—"}`}` : reward.authorizedType === "rewards_staff" ? "موظف الجوايز" : "إدارة البرازيلي"}</small>{reward.authorizedPitch && <small>الموقع: {[reward.authorizedPitch.address, reward.authorizedPitch.city].filter(Boolean).join("، ") || "الموقع مش متسجل"}</small>}{reward.rewardDescription && <small>{reward.rewardDescription}</small>}{reward.canConfirm && reward.status === "valid" && <button className="approve-button" type="button" onClick={() => void confirmVoucher()} disabled={busy}>أكد استلام الجائزة</button>}</div></div>}</Panel>;
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) { return <section className="panel"><div className="panel-head"><div><span className="overline">{eyebrow}</span><h3>{title}</h3></div><QrCode size={19} /></div>{children}</section>; }
