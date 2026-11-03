// auth-forgot-password — issues a single-use reset token and emails a link to the portal.
// Always returns ok (no account enumeration). Public. Env: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, RESEND_API_KEY, PORTAL_ORIGIN, EMAIL_FROM.
import { json, preflight, randomHex, service, sha256Hex } from "../_shared/auth.ts";

async function sendResetEmail(to: string, name: string, link: string): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return; // email not configured — token still stored; admin can also set password manually
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM") ?? "Hericilla Support <no-reply@hericilla.ng>",
      to,
      subject: "Reset your Hericilla password",
      html: `<p style="font-family:sans-serif;font-size:16px">Hi ${name || "there"},</p>
<p style="font-family:sans-serif;font-size:16px">Use the link below to choose a new password. It expires in one hour.</p>
<p style="font-family:sans-serif"><a href="${link}" style="font-size:16px">Reset my password</a></p>
<p style="font-family:sans-serif;font-size:14px;color:#666">If you did not request this, ignore this email.</p>`,
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: true });
  }
  const email = String(body.email ?? "").trim().toLowerCase();

  if (email) {
    const sb = service();
    const { data: profile } = await sb
      .from("hericilla_profiles")
      .select("id, email, full_name")
      .ilike("email", email)
      .maybeSingle();

    if (profile) {
      const raw = randomHex(32);
      const tokenHash = await sha256Hex(raw);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await sb.from("hericilla_password_resets").insert({
        profile_id: profile.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });
      const origin = Deno.env.get("PORTAL_ORIGIN") ?? "";
      const link = `${origin}/auth/reset-password?token=${raw}&email=${encodeURIComponent(profile.email ?? email)}`;
      await sendResetEmail(profile.email ?? email, profile.full_name ?? "", link);
    }
  }

  return json({ ok: true });
});
