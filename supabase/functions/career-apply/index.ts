// career-apply — accepts a job application (name/email/phone/cover letter + optional CV file),
// stores the CV in the private enquiry-uploads bucket via the service role, records the
// application and notifies HR/admins. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected multipart form" }, { status: 400 });
  }

  const fullName = String(form.get("full_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const careerId = String(form.get("career_id") ?? "").trim();
  const coverLetter = String(form.get("cover_letter") ?? "").trim();

  const errors: string[] = [];
  if (fullName.length < 2) errors.push("full_name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("email");
  if (phone.length < 7) errors.push("phone");
  if (form.get("company_website")) return Response.json({ ok: true }); // honeypot
  if (errors.length) return Response.json({ error: "validation failed", fields: errors }, { status: 400 });

  // ── optional CV upload (private bucket, service role bypasses RLS) ─────────
  let cvUrl: string | null = null;
  const file = form.get("cv");
  if (file && file instanceof Blob && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) {
      return Response.json({ error: "cv too large (max 8MB)" }, { status: 400 });
    }
    const name = String(form.get("cv_name") ?? "cv");
    const path = `applications/${crypto.randomUUID()}-${name.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await supabase.storage
      .from("enquiry-uploads")
      .upload(path, file, { upsert: false });
    if (!upErr) cvUrl = path;
  }

  const { data: app, error } = await supabase
    .from("job_applications")
    .insert({
      career_id: careerId || null,
      full_name: fullName,
      email,
      phone,
      cover_letter: coverLetter || null,
      cv_url: cvUrl,
    })
    .select()
    .single();
  if (error || !app) return Response.json({ error: "could not save application" }, { status: 500 });

  await supabase.from("notification_outbox").insert({
    role_target: "hr_officer",
    channels: ["email", "in_app"],
    title: "New job application",
    body: `${fullName} applied${careerId ? " for a posted role" : ""}. Review in Careers.`,
    data: { url: "/cms/careers", application_id: app.id },
  });

  return Response.json({ ok: true, id: app.id }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
});
