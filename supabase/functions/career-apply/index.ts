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

  // ── attachments: up to 6 files (docx/doc/pdf/images), private bucket via service role ─
  const ALLOWED_MIME = new Set([
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const legacyCv = form.get("cv"); // backward compatibility with the old single-CV form
  if (files.length === 0 && legacyCv instanceof File && legacyCv.size > 0) files.push(legacyCv);
  if (files.length > 6) {
    return Response.json({ error: "too many files (max 6)" }, { status: 400 });
  }
  const attachments: { path: string; name: string; mime: string; size: number }[] = [];
  for (const f of files) {
    if (f.size > 8 * 1024 * 1024) {
      return Response.json({ error: `file too large (max 8MB): ${f.name}` }, { status: 400 });
    }
    if (f.type && !ALLOWED_MIME.has(f.type)) {
      return Response.json({ error: `file type not allowed: ${f.name}` }, { status: 400 });
    }
    const safeName = f.name.replace(/[^\w.\-]/g, "_");
    const path = `applications/${careerId || "general"}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("hericilla-enquiry-uploads")
      .upload(path, f, { upsert: false, contentType: f.type || undefined });
    if (upErr) {
      return Response.json({ error: `upload failed: ${f.name}` }, { status: 500 });
    }
    attachments.push({ path, name: f.name, mime: f.type || "application/octet-stream", size: f.size });
  }

  const { data: app, error } = await supabase
    .from("hericilla_job_applications")
    .insert({
      career_id: careerId || null,
      full_name: fullName,
      email,
      phone,
      cover_letter: coverLetter || null,
      cv_url: attachments[0]?.path ?? null,
      attachments,
    })
    .select()
    .single();
  if (error || !app) return Response.json({ error: "could not save application" }, { status: 500 });

  await supabase.from("hericilla_notification_outbox").insert({
    role_target: "hr_officer",
    channels: ["email", "in_app"],
    title: "New job application",
    body: `${fullName} applied${careerId ? " for a posted role" : ""}${attachments.length ? ` with ${attachments.length} file(s)` : ""}. Review in Careers.`,
    data: { url: "/cms/careers", application_id: app.id, entity: "hericilla_job_applications" },
  });

  return Response.json({ ok: true, id: app.id }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
});
