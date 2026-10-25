// enquiry-intake — validates the public quotation/enquiry form, stores the enquiry,
// returns the ENQ-YYYY-##### reference and notifies admins (email + in-app).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (optional)
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SERVICE_TYPES = ["logistics", "trucking", "transportation", "procurement", "packing_removal", "materials_support"] as const;

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  // ── validation (mirrors the website's Zod schema) ─────────────────────────
  const errors: string[] = [];
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const message = String(body.message ?? "").trim();
  if (name.length < 2) errors.push("name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("email");
  if (message.length < 10) errors.push("message");
  if (body.service_type && !SERVICE_TYPES.includes(body.service_type)) errors.push("service_type");
  // honeypot — silently accept & drop
  if (body.company_website) return Response.json({ ok: true, ref_no: "ENQ-SPAM" });
  if (errors.length) return Response.json({ error: "validation failed", fields: errors }, { status: 400 });

  // ── insert (ref_no default next_ref('ENQ') fires in the DB) ───────────────
  const { data: enquiry, error } = await supabase
    .from("hericilla_enquiries")
    .insert({
      enquiry_type: body.enquiry_type ?? "quotation",
      service_type: body.service_type ?? null,
      name,
      company: body.company ?? null,
      email,
      phone: body.phone ?? null,
      message,
      cargo_details: body.cargo_details ?? null,
      pickup_location: body.pickup_location ?? null,
      destination: body.destination ?? null,
      needed_by: body.needed_by ?? null,
      documents: Array.isArray(body.documents) ? body.documents.slice(0, 10) : [],
    })
    .select()
    .single();
  if (error || !enquiry) return Response.json({ error: "could not save enquiry" }, { status: 500 });

  // ── notify admins (outbox → notify function fans out) ─────────────────────
  await supabase
    .from("hericilla_notification_outbox")
    .insert({
      role_target: "admin",
      channels: ["email", "in_app"],
      title: `New enquiry ${enquiry.ref_no}`,
      body: `${name}${enquiry.company ? ` (${enquiry.company})` : ""}: ${message.slice(0, 160)}`,
      data: { url: `/inbox/enquiries/${enquiry.id}`, enquiry_id: enquiry.id },
    });

  // ── receipt email to the visitor ──────────────────────────────────────────
  const key = Deno.env.get("RESEND_API_KEY");
  if (key) {
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") ?? "Hericilla Support <enquiries@hericilla.example>",
        to: email,
        subject: `We received your enquiry — ${enquiry.ref_no}`,
        html:
          `<p style="font-family:sans-serif;font-size:17px;line-height:1.7">Dear ${name},</p>` +
          `<p style="font-family:sans-serif;font-size:17px;line-height:1.7">Thank you for contacting Hericilla Support Services. ` +
          `Your reference number is <strong>${enquiry.ref_no}</strong>. An officer will respond within 24 hours.</p>` +
          `<p style="font-family:sans-serif;font-size:17px">You can check status any time at <a href="https://hericilla.test/status">${enquiry.ref_no}</a>.</p>`,
      }),
    }).catch(() => {});
  }

  return Response.json({ ok: true, ref_no: enquiry.ref_no, id: enquiry.id }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
});
