// auth-reset-password — exchanges a valid, unexpired reset token for a new password.
// Public. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET.
import bcrypt from "npm:bcryptjs@2.4.3";
import { json, preflight, service, sha256Hex } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid or expired reset link" }, 400);
  }
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");
  if (!token || password.length < 8) {
    return json({ error: "Choose a password of at least 8 characters." }, 400);
  }

  const sb = service();
  const tokenHash = await sha256Hex(token);
  const { data: reset } = await sb
    .from("hericilla_password_resets")
    .select("id, profile_id")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!reset) return json({ error: "That reset link is invalid or has expired. Please request a new one." }, 400);

  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  await sb.from("hericilla_user_credentials").upsert(
    { profile_id: reset.profile_id, password_hash: hash, must_reset: false, updated_at: now },
    { onConflict: "profile_id" },
  );
  await sb.from("hericilla_password_resets").update({ used_at: now }).eq("id", reset.id);

  return json({ ok: true });
});
