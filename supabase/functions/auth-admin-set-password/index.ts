// auth-admin-set-password — a manager sets/resets another user's password directly.
// Powers the admin "Set password" action and forced resets. Env: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET.
import bcrypt from "npm:bcryptjs@2.4.3";
import { json, preflight, requireManager, service } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const caller = await requireManager(req);
  if (caller instanceof Response) return caller;

  const body = await req.json();
  const profileId = String(body.profile_id ?? "").trim();
  const password = String(body.password ?? "");
  const mustReset = body.must_reset === true;
  if (!profileId) return json({ error: "profile_id is required" }, 400);
  if (password.length < 8) return json({ error: "Choose a password of at least 8 characters." }, 400);

  const sb = service();
  const { data: target } = await sb.from("hericilla_profiles").select("id").eq("id", profileId).maybeSingle();
  if (!target) return json({ error: "No such user." }, 404);

  const hash = await bcrypt.hash(password, 10);
  await sb.from("hericilla_user_credentials").upsert(
    { profile_id: profileId, password_hash: hash, must_reset: mustReset, updated_at: new Date().toISOString() },
    { onConflict: "profile_id" },
  );

  return json({ ok: true });
});
