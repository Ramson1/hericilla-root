// auth-change-password — the signed-in user changes their own password (used for the
// forced-reset-on-first-login flow). Requires a valid bearer token. Env: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET.
import bcrypt from "npm:bcryptjs@2.4.3";
import { callerSub, json, preflight, service } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const sub = await callerSub(req);
  if (!sub) return json({ error: "invalid session" }, 401);

  const body = await req.json();
  const current = String(body.current ?? "");
  const next = String(body.new ?? "");
  if (next.length < 8) return json({ error: "Choose a new password of at least 8 characters." }, 400);

  const sb = service();
  const { data: cred } = await sb
    .from("hericilla_user_credentials")
    .select("password_hash")
    .eq("profile_id", sub)
    .maybeSingle();
  if (!cred) return json({ error: "No credentials found for this account." }, 400);

  const ok = await bcrypt.compare(current, cred.password_hash);
  if (!ok) return json({ error: "Your current password is not correct." }, 401);

  const hash = await bcrypt.hash(next, 10);
  await sb
    .from("hericilla_user_credentials")
    .update({ password_hash: hash, must_reset: false, updated_at: new Date().toISOString() })
    .eq("profile_id", sub);

  return json({ ok: true });
});
