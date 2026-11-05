import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle, Mic, MicOff, Phone, PhoneOff, Video, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const api = trpc as any;
type Mode = "audio" | "video";
type Incoming = { callId: string; roomId: number; senderId?: number; payload?: string };

export default function CallOverlay({ roomId, peerName, mode, incoming, onClose }: { roomId: number; peerName: string; mode: Mode; incoming?: Incoming | null; onClose: () => void }) {
  const callStart = api.chat.callStart.useMutation();
  const [callId, setCallId] = useState<string | null>(incoming?.callId || null);
  const callSignal = api.chat.callSignal.useMutation();
  const callSignals = api.chat.callSignals.useQuery({ roomId, callId: callId || "pending-call-id", afterSeq: 0 }, { enabled: false, retry: false });
  const callEnd = api.chat.callEnd.useMutation();
  const [status, setStatus] = useState(incoming ? "مكالمة واردة" : "جارٍ الاتصال…");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(mode !== "video");
  const [accepted, setAccepted] = useState(!incoming);
  const [busy, setBusy] = useState(Boolean(!incoming));
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalQueueRef = useRef<Promise<void>>(Promise.resolve());
  const seqRef = useRef(0);
  const candidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const closedRef = useRef(false);

  useEffect(() => {
    if (incoming || callId || closedRef.current) return;
    let cancelled = false;
    const startCall = async () => {
      try {
        const result = await callStart.mutateAsync({ roomId, mode });
        if (!cancelled && result?.callId) setCallId(result.callId);
      } catch (error: any) {
        if (!cancelled) { setStatus("تعذر إرسال رنين المكالمة"); setBusy(false); toast.error(error?.message || "تعذر بدء المكالمة."); }
      }
    };
    void startCall();
    return () => { cancelled = true; };
  }, [incoming, callId, roomId, mode]);

  const sendSignal = (kind: string, payload: unknown) => {
    const task = signalQueueRef.current.then(async () => {
      if (!callId || closedRef.current) return;
      await callSignal.mutateAsync({ roomId, callId, kind, payload: JSON.stringify(payload) });
    });
    signalQueueRef.current = task.catch(() => undefined);
    return task;
  };

  const attachStream = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("المكالمة تحتاج HTTPS ومتصفحاً يدعم الكاميرا والميكروفون.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: mode === "video" ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } : false,
    });
    localStreamRef.current = stream;
    if (localVideo.current) { localVideo.current.srcObject = stream; localVideo.current.muted = true; }
    return stream;
  };

  const createPeer = async (stream: MediaStream) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
      ],
      iceCandidatePoolSize: 10,
    });
    peerRef.current = peer;
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    peer.ontrack = event => {
      const stream = event.streams[0] || remoteStreamRef.current || new MediaStream();
      if (!event.streams[0]) stream.addTrack(event.track);
      remoteStreamRef.current = stream;
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = stream;
        remoteVideo.current.muted = true;
        void remoteVideo.current.play().catch(() => undefined);
      }
      if (remoteAudio.current) {
        remoteAudio.current.srcObject = stream;
        remoteAudio.current.volume = 1;
        void remoteAudio.current.play().catch(() => setStatus("اضغط داخل المكالمة لتشغيل الصوت"));
      }
      setStatus("متصل الآن"); setBusy(false);
    };
    peer.onicecandidate = event => { if (event.candidate) void sendSignal("ice-candidate", event.candidate.toJSON()); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") { setStatus("متصل الآن"); setBusy(false); }
      else if (peer.connectionState === "failed") setStatus("تعذر إنشاء اتصال المكالمة؛ أعد المحاولة.");
      else if (["disconnected", "closed"].includes(peer.connectionState)) setStatus("انقطع الاتصال");
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "failed") setStatus("تعذر عبور الشبكة بين الطرفين؛ أعد المحاولة.");
    };
    return peer;
  };

  useEffect(() => {
    if (!accepted || !callId || closedRef.current) return;
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await attachStream();
        const peer = await createPeer(stream);
        if (!incoming) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await sendSignal("offer", offer);
        }
        if (!cancelled) setStatus(incoming ? "جارٍ فتح المكالمة…" : "في انتظار الرد…");
      } catch (error: any) { setStatus("تعذر تشغيل الكاميرا أو الميكروفون"); toast.error(error?.message || "تعذر بدء المكالمة."); setBusy(false); }
    };
    void start();
    return () => { cancelled = true; };
  }, [accepted, callId]);

  useEffect(() => {
    if (!accepted || !callId || closedRef.current) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await callSignals.refetch();
        const items = (result.data?.items || []).filter((item: any) => item.seq > seqRef.current);
        for (const item of items) {
          seqRef.current = Math.max(seqRef.current, Number(item.seq));
          const peer = peerRef.current;
          if (!peer) continue;
          const payload = JSON.parse(item.payload || "{}");
          if (item.kind === "ring") continue;
          if (item.kind === "offer" && !peer.remoteDescription) {
            await peer.setRemoteDescription(payload);
            for (const candidate of candidateQueue.current.splice(0)) await peer.addIceCandidate(candidate);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await sendSignal("answer", answer);
            setStatus("متصل الآن"); setBusy(false);
          } else if (item.kind === "answer" && !peer.remoteDescription) {
            await peer.setRemoteDescription(payload);
            for (const candidate of candidateQueue.current.splice(0)) await peer.addIceCandidate(candidate);
            setStatus("متصل الآن"); setBusy(false);
          } else if (item.kind === "ice-candidate") {
            if (peer.remoteDescription) await peer.addIceCandidate(payload); else candidateQueue.current.push(payload);
          } else if (item.kind === "bye") { setStatus("أنهى الطرف الآخر المكالمة"); finish(false); }
        }
      } catch { if (!closedRef.current) setStatus("جارٍ إعادة مزامنة المكالمة…"); }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [accepted, callId]);

  const finish = async (notify = true) => {
    closedRef.current = true;
    try { if (notify && callId) await callEnd.mutateAsync({ roomId, callId }); } catch { /* already ended */ }
    peerRef.current?.close();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    if (remoteAudio.current) remoteAudio.current.srcObject = null;
    remoteStreamRef.current = null;
    peerRef.current = null; localStreamRef.current = null;
    onClose();
  };
  const accept = async () => {
    setAccepted(true); setBusy(true); setStatus("جارٍ قبول المكالمة…");
  };
  const reject = () => { void finish(true); };
  const toggleMute = () => { const next = !muted; localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; }); setMuted(next); };
  const toggleCamera = () => { const next = !cameraOff; localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = !next; }); setCameraOff(next); };
  const resumeRemoteMedia = async () => {
    const players = [remoteAudio.current, remoteVideo.current].filter(Boolean) as HTMLMediaElement[];
    for (const player of players) { try { await player.play(); } catch { /* browser may still require a fresh user gesture */ } }
  };

  return <div className="call-overlay" role="dialog" aria-modal="true" aria-label="مكالمة">
    <div className="call-card" onClick={() => void resumeRemoteMedia()}>
      <button className="call-close" onClick={() => void finish(true)} aria-label="إغلاق"><X size={18} /></button>
      <div className="call-heading"><span className="call-avatar">{peerName.charAt(0)}</span><div><b>{peerName}</b><small>{status}</small></div></div>
      <div className={`call-stage ${mode === "video" ? "has-video" : "audio-only"}`}>
        {mode === "video" ? <><video ref={remoteVideo} autoPlay playsInline className="call-remote-video" /><video ref={localVideo} autoPlay playsInline muted className="call-local-video" /></> : <div className="call-audio-mark"><Phone size={30} /><span>{busy ? "جارٍ الاتصال" : "صوت فقط"}</span></div>}
        <audio ref={remoteAudio} autoPlay playsInline />
      </div>
      {!accepted && incoming ? <div className="call-actions incoming-actions"><button className="call-action accept" onClick={() => void accept()}><Phone size={18} /> قبول {mode === "video" ? "الفيديو" : "المكالمة"}</button><button className="call-action decline" onClick={reject}><PhoneOff size={18} /> رفض</button></div> : <div className="call-actions"><button className={`call-round ${muted ? "active" : ""}`} onClick={toggleMute} aria-label={muted ? "تشغيل الميكروفون" : "كتم الميكروفون"}>{muted ? <MicOff size={18} /> : <Mic size={18} />}</button>{mode === "video" && <button className={`call-round ${cameraOff ? "active" : ""}`} onClick={toggleCamera} aria-label={cameraOff ? "تشغيل الكاميرا" : "إيقاف الكاميرا"}>{cameraOff ? <CameraOff size={18} /> : <Camera size={18} />}</button>}<button className="call-round hangup" onClick={() => void finish(true)} aria-label="إنهاء المكالمة"><PhoneOff size={18} /></button></div>}
    </div>
  </div>;
}
