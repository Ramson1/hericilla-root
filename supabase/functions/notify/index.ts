// notify — outbox consumer: Expo push + Web Push + Resend email + in-app bell rows.
// Invoke: scheduled (pg_cron every minute) or manually with the service key.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//      VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, EXPO_ACCESS_TOKEN (optional)
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BATCH = 25;
const MAX_ATTEMPTS = 5;

const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
if (vapidPublic && vapidPrivate) {
  webpush.setVAPIDKeys({
    publicKey: vapidPublic,
    privateKey: vapidPrivate,
    subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:it@hericilla.test",
  });
}

async function sendExpo(rows: any[]) {
  const tokens = new Map<string, any[]>(); // token -> notification rows
  for (const row of rows.filter((r) => r.channels.includes("expo_push"))) {
    const { data: toks } = await supabase
      .from("expo_push_tokens")
      .select("token")
      .eq("user_id", row.recipient_user_id)
      .eq("enabled", true);
    for (const t of toks ?? []) {
      if (!tokens.has(t.token)) tokens.set(t.token, []);
      tokens.get(t.token)!.push(row);
    }
  }
  if (tokens.size === 0) return new Set<string>();
  const messages = [...tokens.entries()].flatMap(([token, rows]) =>
    rows.map((r) => ({
      to: token,
      title: r.title,
      body: r.body,
      data: r.data ?? {},
    })),
  );
  // Expo accepts batches of <=100
  const failedTokens = new Set<string>();
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(Deno.env.get("EXPO_ACCESS_TOKEN")
          ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` }
          : {}),
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) continue;
    const { data } = await res.json();
    for (const receipt of data ?? []) {
      if (receipt.status === "error" &&
        ["DeviceNotRegistered", "InvalidSdkVersion"].includes(receipt.message)) {
        failedTokens.add(receipt.ticket ?? chunk[0]?.to);
      }
    }
  }
  // Drop tokens for uninstalled devices
  for (const t of failedTokens) {
    await supabase.from("expo_push_tokens").delete().eq("token", t);
  }
}

async function sendWebPush(rows: any[]) {
  const { data: subs } = await supabase.from("web_push_subscriptions").select("id, endpoint, p256dh, auth, user_id");
  const byUser = new Map<string, any[]>();
  for (const s of subs ?? []) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id)!.push(s);
  }
  for (const row of rows.filter((r) => r.channels.includes("web_push"))) {
    for (const sub of byUser.get(row.recipient_user_id) ?? []) {
      try {
        await webpush.send(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: row.title, body: row.body, url: row.data?.url ?? "/" }),
        );
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from("web_push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
  }
}

async function sendEmail(rows: any[]) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const userIds = [...new Set(rows.filter((r) => r.channels.includes("email")).map((r) => r.recipient_user_id))];
  if (userIds.length === 0) return;
  const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").in("id", userIds);
  const emailOf = new Map((profiles ?? []).map((p: any) => [p.id, p.email]));
  for (const row of rows.filter((r) => r.channels.includes("email"))) {
    const to = emailOf.get(row.recipient_user_id);
    if (!to) continue;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") ?? "Hericilla Support <notify@hericilla.example>",
        to,
        subject: row.title,
        html: `<p style="font-family:sans-serif;font-size:16px">${row.body}</p>`,
      }),
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { allow: "POST, GET, OPTIONS" } });
  // Guard: only the scheduler / service role may trigger a sweep
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (auth !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") && req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1) expand role-targeted notifications into per-user rows
  await supabase.rpc("expand_role_notifications");

  // 2) claim due rows
  const { data: rows, error } = await supabase
    .from("notification_outbox")
    .select("*")
    .in("status", ["queued", "retrying"])
    .lte("next_retry_at", new Date().toISOString())
    .not("recipient_user_id", "is", null)
    .limit(BATCH);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return Response.json({ sent: 0 });

  const ids = rows.map((r) => r.id);
  await supabase.from("notification_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).in("id", ids);

  // 3) fan out — failures mark retrying/failed with backoff
  try {
    await Promise.all([sendExpo(rows), sendWebPush(rows), sendEmail(rows)]);
  } catch (e) {
    await supabase
      .from("notification_outbox")
      .update({
        status: "retrying",
        attempt_count: 1,
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: String(e).slice(0, 300),
      })
      .in("id", ids);
  }

  // 4) hard-fail rows past the attempt cap
  await supabase
    .from("notification_outbox")
    .update({ status: "failed" })
    .eq("status", "retrying")
    .gte("attempt_count", MAX_ATTEMPTS);

  return Response.json({ sent: rows.length });
});
