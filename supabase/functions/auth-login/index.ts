// auth-login — verifies the custom credentials table and mints an HS256 JWT whose `sub`
// is the profile id, so PostgREST still resolves auth.uid() and all RLS keeps working.
// Public (no bearer required). Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AUTH_JWT_SECRET.
import bcrypt from "npm:bcryptjs@2.4.3";
import { json, preflight, service, signToken } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    return await login(req);
  } catch (err) {
    // Surface config/server faults as a readable message instead of a bare 500.
    const message = err instanceof Error ? err.message : "unexpected error";
    console.error("auth-login failed:", message);
    return json({ error: `Sign-in is temporarily unavailable: ${message}` }, 500);
  }
});

async function login(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid credentials" }, 401);
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return json({ error: "invalid credentials" }, 401);

  const sb = service();
  const { data: profile } = await sb
    .from("hericilla_profiles")
    .select("id, full_name, email, phone, role, department_id, employee_no, avatar_url, home_base, status, license_number, license_expiry, employed_at")
    .ilike("email", email)
    .maybeSingle();

  // Constant generic error on any failure — never reveal whether the email exists.
  if (!profile) return json({ error: "invalid credentials" }, 401);

  const { data: cred } = await sb
    .from("hericilla_user_credentials")
    .select("password_hash, must_reset")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!cred) return json({ error: "invalid credentials" }, 401);

  const ok = await bcrypt.compare(password, cred.password_hash);
  if (!ok) return json({ error: "invalid credentials" }, 401);

  if (profile.status !== "active") {
    return json({ error: "This account is inactive. Please contact the office.", code: "inactive" }, 403);
  }

  const mustReset = cred.must_reset === true;
  const token = await signToken({ sub: profile.id, email: profile.email, mustReset });
  return json({ token, profile, must_reset: mustReset });
}
