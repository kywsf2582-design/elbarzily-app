import { useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

export async function enableWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("هذا الجهاز لا يدعم إشعارات Push الخاصة بالمتصفح.");
  }
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("لم يتم السماح بإشعارات الجهاز.");
  window.dispatchEvent(new CustomEvent("elbarzily:push-permission-granted"));
}

export default function PushNotifications() {
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: 20_000 });
  const keyQuery = trpc.push.publicKey.useQuery(undefined, { retry: false, staleTime: 5 * 60_000 });
  const register = trpc.push.register.useMutation();

  const syncSubscription = useCallback(async () => {
    if (!meQuery.data || !keyQuery.data?.publicKey || Notification.permission !== "granted") return;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(keyQuery.data.publicKey) });
    }
    await register.mutateAsync({
      subscription: subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null },
      deviceName: /Android/i.test(navigator.userAgent) ? "Android" : /iPhone|iPad/i.test(navigator.userAgent) ? "iPhone/iPad" : "متصفح سطح المكتب",
    });
  }, [keyQuery.data?.publicKey, meQuery.data, register]);

  useEffect(() => {
    if (!import.meta.env.PROD || !meQuery.data || !keyQuery.data?.publicKey) return;
    if (Notification.permission === "granted") void syncSubscription().catch(() => undefined);
  }, [keyQuery.data?.publicKey, meQuery.data, syncSubscription]);

  useEffect(() => {
    const handler = () => void syncSubscription().catch(() => undefined);
    window.addEventListener("elbarzily:push-permission-granted", handler);
    return () => window.removeEventListener("elbarzily:push-permission-granted", handler);
  }, [syncSubscription]);

  return null;
}
