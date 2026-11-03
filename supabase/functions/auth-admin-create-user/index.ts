// auth-admin-create-user — replaces admin-invite. A manager creates a profile + credentials
// row directly (no Supabase Auth). No email verification; the account is active immediately and
// must_reset forces a new password on first sign-in. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_JWT_SECRET.
import bcrypt from "npm:bcryptjs@2.4.3";
import { json, preflight, requireManager, service } from "../_shared/auth.ts";

const VALID_ROLES = [
  "super_admin", "admin", "supervisor", "procurement_officer", "finance_officer",
  "logistics_officer", "warehouse_agent", "hr_officer", "staff", "driver", "auditor",
];

function tempPassword(): string {
  // 14 readable chars; the manager shares it once, the user sets their own at first sign-in.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "Hericilla-";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const caller = await requireManager(req);
  if (caller instanceof Response) return caller;

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const role = String(body.role ?? "");
  const phone = String(body.phone ?? "").trim() || null;
  const departmentId = String(body.department_id ?? "").trim() || null;
  const chosen = String(body.password ?? "").trim();
  const password = chosen.length >= 8 ? chosen : tempPassword();

  const errors: string[] = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("email");
  if (fullName.length < 2) errors.push("full_name");
  if (!VALID_ROLES.includes(role)) errors.push("role");
  if (errors.length) return json({ error: "validation failed", fields: errors }, 400);

  const sb = service();
  const { count } = await sb
    .from("hericilla_profiles")
    .select("id", { count: "exact", head: true })
    .ilike("email", email);
  if (count && count > 0) return json({ error: "A user with that email already exists." }, 400);

  const id = crypto.randomUUID();
  const { error: profileErr } = await sb.from("hericilla_profiles").insert({
    id,
    full_name: fullName,
    email,
    role,
    phone,
    department_id: departmentId,
    status: "active",
  });
  if (profileErr) return json({ error: "Could not create the user." }, 400);

  const hash = await bcrypt.hash(password, 10);
  await sb.from("hericilla_user_credentials").insert({
    profile_id: id,
    password_hash: hash,
    must_reset: chosen.length >= 8 ? false : true,
  });

  await sb.from("hericilla_notification_outbox").insert({
    recipient_user_id: id,
    channels: ["email", "in_app"],
    title: "Welcome to Hericilla",
    body: `Your ${role.replaceAll("_", " ")} account was created. Sign in and set your own password.`,
    data: { url: "/", invite: true },
  });

  return json({ ok: true, user_id: id, temp_password: password });
});
