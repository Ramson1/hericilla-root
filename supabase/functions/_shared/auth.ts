// Shared helpers for the fully custom auth Edge Functions.
// - Mint/verify HS256 JWTs signed with the project's legacy JWT secret so PostgREST
//   still resolves auth.uid() (= sub) and every existing RLS policy keeps working.
// - service(): a service-role client for privileged lookups (credentials, resets,
//   admin user creation) that anon/authenticated roles must never reach.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, jwtVerify } from "npm:jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Supabase stopped injecting SUPABASE_JWT_SECRET into the Edge Runtime, so the
// legacy HS256 secret is provided as the project secret AUTH_JWT_SECRET (which the
// CLI also allows — SUPABASE_* is a reserved prefix). Either name works.
const JWT_SECRET = Deno.env.get("AUTH_JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET") || "";

export const ISSUER = "supabase";
export const AUDIENCE = "authenticated";
export const TTL_SECONDS = 12 * 3600; // 12h, no refresh in v1

/** Roles allowed to create users and set passwords. */
export const MANAGER_ROLES = ["super_admin", "admin", "hr_officer"];

/** Throws a descriptive error instead of a cryptic TypeError when the secret is absent. */
export function secretKey(): Uint8Array {
  if (!JWT_SECRET) {
    throw new Error("JWT secret is not configured: set the AUTH_JWT_SECRET secret on the Supabase project.");
  }
  return new TextEncoder().encode(JWT_SECRET);
}

export function service() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function preflight(): Response {
  return new Response(null, { headers: CORS_HEADERS });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Sign a custom HS256 JWT. `role` is fixed to "authenticated" so PostgREST grants the DB role. */
export async function signToken(params: { sub: string; email: string; mustReset?: boolean }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ email: params.email, role: AUDIENCE, must_reset: params.mustReset === true })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(params.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(secretKey());
}

/** Verify the caller's bearer token; returns the profile id (`sub`) or null. */
export async function callerSub(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER, audience: AUDIENCE });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Verify the caller AND that they hold a manager role. Returns sub or a rejection Response. */
export async function requireManager(req: Request): Promise<string | Response> {
  const sub = await callerSub(req);
  if (!sub) return json({ error: "invalid session" }, 401);
  const { data } = await service().from("hericilla_profiles").select("role, status").eq("id", sub).maybeSingle();
  if (!data || data.status !== "active" || !MANAGER_ROLES.includes(data.role)) {
    return json({ error: "only admins or HR can manage users" }, 403);
  }
  return sub;
}

export function sha256Hex(input: string): Promise<string> {
  return (async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  })();
}

/** Random hex string of `bytes` bytes (used for password-reset tokens). */
export function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
