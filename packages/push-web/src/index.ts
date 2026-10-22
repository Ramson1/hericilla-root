"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase, hasSupabaseEnv } from "@hericilla/supabase-clients";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * Browser Web Push for the admin & staff portals.
 * Requires a service worker at /sw.js in the host app and a
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY env var. Subscriptions are stored in
 * public.web_push_subscriptions (RLS: own rows only).
 */
export function useWebPush() {
  const vapidKey =
    (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env
      ?.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        Boolean(vapidKey),
    );
    // The host app ships a public/sw.js; register it once on mount.
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, [vapidKey]);

  const subscribe = useCallback(async () => {
    if (!hasSupabaseEnv()) {
      setError("Backend not configured yet.");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));
      const json = subscription.toJSON();
      // user_id is NOT NULL and RLS-restricted to own rows — resolve it from the session.
      const { data: sess } = await getSupabase().auth.getUser();
      if (!sess?.user) {
        throw new Error("You are signed out. Sign in again and press the button once more.");
      }
      await getSupabase()
        .from("web_push_subscriptions")
        .upsert(
          {
            user_id: sess.user.id,
            endpoint: json.endpoint,
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
            user_agent: navigator.userAgent.slice(0, 200),
          },
          { onConflict: "endpoint" },
        );
      setSubscribed(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications.");
      setSubscribed(false);
    }
  }, [vapidKey]);

  const enableNotifications = useCallback(async () => {
    const permission = await Notification.requestPermission();
    if (permission === "granted") await subscribe();
    else setError("Browser blocked notifications. Allow them in site settings.");
  }, [subscribe]);

  return { supported, subscribed, enableNotifications, error };
}

/**
 * Unread count for the in-app bell (shared by admin & staff portals).
 * Polls the outbox — no realtime subscription needed, so it stays cheap.
 */
export function useUnseenCount(userId: string | null, role: string | null, everyMs = 60_000): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId || !role || !hasSupabaseEnv()) return;
    let alive = true;
    async function run() {
      const s = getSupabase();
      const { data: rows } = await s
        .from("notification_outbox")
        .select("id")
        .or(`recipient_user_id.eq.${userId},role_target.eq.${role}`)
        .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
        .limit(200);
      const ids = ((rows as { id: string }[]) ?? []).map((r) => r.id);
      if (ids.length === 0) {
        if (alive) setCount(0);
        return;
      }
      const { data: seen } = await s
        .from("notifications_seen")
        .select("outbox_id")
        .eq("user_id", userId)
        .in("outbox_id", ids);
      const seenSet = new Set(((seen as { outbox_id: string }[]) ?? []).map((x) => x.outbox_id));
      if (alive) setCount(ids.filter((i) => !seenSet.has(i)).length);
    }
    void run();
    const t = setInterval(() => void run(), everyMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [userId, role, everyMs]);

  return count;
}
