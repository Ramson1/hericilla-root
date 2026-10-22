// admin-invite — creates a new auth user + profile for an office member (browser clients
// cannot call supabase.auth.admin, so this runs with the service role). Caller must hold
// super_admin / admin / hr_officer (mirrors the profile_admin_write RLS policy).
// The handle_new_user trigger (0002) builds the profile row from user_metadata; we then
// correct role/department in case the trigger defaults differed. Env: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MANAGER_ROLES = ["super_admin", "admin", "hr_officer"];
const VALID_ROLES = [
  "super_admin", "admin", "supervisor", "procurement_officer", "finance_officer",
  "logistics_officer", "warehouse_agent", "hr_officer", "staff", "driver", "auditor",
];

function tempPassword(): string {
  // 14 readable chars; admin shares it once, user resets via email on first login.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "Hericilla-";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }
  if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });

  const jwt = req.headers.get("authorization");
  if (!jwt) return Response.json({ error: "missing auth header" }, { status: 401 });

  // Verify the caller is a manager role (read own profile with their own token).
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { authorization: jwt } } },
  );
  const { data: me, error: meErr } = await caller.auth.getUser();
  if (meErr || !me?.user) return Response.json({ error: "invalid session" }, { status: 401 });
  const { data: myProfile } = await caller
    .from("profiles")
    .select("role")
    .eq("id", me.user.id)
    .single();
  if (!myProfile || !MANAGER_ROLES.includes(myProfile.role)) {
    return Response.json({ error: "only admins or HR can invite users" }, { status: 403 });
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const role = String(body.role ?? "");
  const phone = String(body.phone ?? "").trim() || null;
  const departmentId = String(body.department_id ?? "").trim() || null;

  const errors: string[] = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("email");
  if (fullName.length < 2) errors.push("full_name");
  if (!VALID_ROLES.includes(role)) errors.push("role");
  if (errors.length) return Response.json({ error: "validation failed", fields: errors }, { status: 400 });

  const password = tempPassword();
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role, department_id: departmentId ?? "", phone: phone ?? "" },
  });
  if (createErr) {
    const msg = /already/i.test(createErr.message)
      ? "A user with that email already exists."
      : "Could not create the user.";
    return Response.json({ error: msg }, { status: 400 });
  }

  // Belt & braces: make sure the profile carries the exact role/department/phone.
  await service
    .from("profiles")
    .update({
      full_name: fullName,
      role,
      phone,
      department_id: departmentId,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", created.user.id);

  await service.from("notification_outbox").insert({
    recipient_user_id: created.user.id,
    channels: ["email", "in_app"],
    title: "Welcome to Hericilla",
    body: `Your ${role.replaceAll("_", " ")} account was created. Sign in and change your password right away.`,
    data: { url: "/", invite: true },
  });

  return Response.json(
    { ok: true, user_id: created.user.id, temp_password: password },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
});
