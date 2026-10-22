// pdf-export — renders invoice, payslip and waybill PDFs on demand.
// POST { kind: 'invoice'|'payslip'|'waybill', id: uuid } with the caller's JWT;
// RLS applies (we read with the caller's token), and the PDF is returned inline.
// For batch jobs (month-end payroll pack) call with the service role key.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
  const jwt = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    jwt === serviceKey ? serviceKey : jwt, // service-role for batches, user JWT otherwise
  );

  const { kind, id } = await req.json();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = rgb(0.04, 0.31, 0.35); // deep teal from brand tokens
  const grey = rgb(0.35, 0.35, 0.35);

  let y = 800;
  const line = (
    text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; dx?: number } = {},
  ) => {
    page.drawText(text, {
      x: opts.dx ?? 48,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? bold : font,
      color: opts.color ?? rgb(0, 0, 0),
    });
    y -= (opts.size ?? 11) + 6;
  };

  const header = (title: string, ref: string) => {
    line("HERICILLA SUPPORT SERVICES LIMITED", { size: 16, bold: true, color: brand });
    line("RC 8100414 · Abuloma, Port Harcourt, Rivers State, Nigeria", { size: 9, color: grey });
    line("");
    line(title, { size: 20, bold: true });
    line(`Reference: ${ref}`, { size: 11, color: grey });
    line(`Generated: ${new Date().toISOString().slice(0, 10)}`, { size: 9, color: grey });
    line("");
  };

  const money = (n: number | null | undefined) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(n ?? 0);

  if (kind === "invoice") {
    const { data: inv } = await supabase
      .from("invoices").select("*, client:clients(*), items:invoice_items(*)").eq("id", id).single();
    if (!inv) return Response.json({ error: "invoice not found" }, { status: 404 });
    header("INVOICE", inv.ref_no);
    line(`Bill to: ${inv.client?.name ?? "—"}`, { bold: true });
    if (inv.client?.address) line(inv.client.address, { size: 10, color: grey });
    line(`Issue date: ${inv.issue_date}   Due: ${inv.due_date ?? "—"}`, { size: 10 });
    line("");
    (inv.items ?? []).forEach((it: any, i: number) => {
      line(`${i + 1}. ${it.description}`, { dx: 48 });
      line(`${money(it.amount)}`, { dx: 460 });
    });
    line("");
    line("Subtotal", { bold: true }); line(money(inv.subtotal), { dx: 460 });
    line(`VAT (${inv.tax_rate}%)`); line(money((inv.subtotal * inv.tax_rate) / 100), { dx: 460 });
    line("TOTAL", { size: 14, bold: true, color: brand });
    line(money(inv.total), { dx: 460, size: 14, bold: true, color: brand });
    line("");
    line("Payment: bank transfer to the account on file. Quote the invoice number.", { size: 9, color: grey });
  } else if (kind === "payslip") {
    const { data: ps } = await supabase
      .from("payslips")
      .select("*, employee:profiles!payslips_employee_id_fkey(full_name, employee_no, phone), run:payroll_runs(period_month, status)")
      .eq("id", id).single();
    if (!ps) return Response.json({ error: "payslip not found" }, { status: 404 });
    header("PAYSLIP", `${ps.employee?.employee_no ?? ""} / ${ps.run?.period_month ?? ""}`);
    line(`Employee: ${ps.employee?.full_name ?? "—"}`, { bold: true });
    line(`Period: ${ps.run?.period_month}   Status: ${ps.run?.status}`, { size: 10 });
    line("");
    const rows: [string, number][] = [
      ["Base salary", ps.base_salary],
      [`Hours worked: ${ps.hours_worked} (OT ${ps.overtime_hours}h @ allowance)`, ps.overtime_amount],
      ["Allowances", ps.allowances_amount],
      ["Adjustments" + (ps.adjustment_reason ? ` (${ps.adjustment_reason})` : ""), ps.adjustment_amount],
      ["Deductions", -ps.deductions_amount],
      ["Statutory deductions", -ps.statutory_deductions],
    ];
    rows.forEach(([l, v]) => { line(l); line(money(v), { dx: 420 }); });
    line("");
    line("NET PAY", { size: 14, bold: true, color: brand });
    line(money(ps.net), { dx: 420, size: 14, bold: true, color: brand });
  } else if (kind === "waybill") {
    const { data: j } = await supabase
      .from("transport_jobs")
      .select("*, work_order:work_orders(wo_number, title), driver:profiles!transport_jobs_driver_id_fkey(full_name, phone, license_number), client:clients(name)")
      .eq("id", id).single();
    if (!j) return Response.json({ error: "job not found" }, { status: 404 });
    header("WAYBILL", j.ref_no);
    line(`Work order: ${j.work_order?.wo_number} — ${j.work_order?.title}`, { size: 10 });
    line(`Client: ${j.client?.name ?? "—"}`, { size: 10 });
    line("");
    line("Pickup", { bold: true }); line(j.pickup_location, { size: 10 });
    line("Destination", { bold: true }); line(j.destination, { size: 10 });
    if (j.delivery_instructions) { line(""); line("Instructions", { bold: true }); line(j.delivery_instructions, { size: 10 }); }
    line("");
    line(`Driver: ${j.driver?.full_name ?? "unassigned"}  Lic: ${j.driver?.license_number ?? "—"}`, { size: 10 });
    line(`Scheduled: ${j.scheduled_at ?? "—"}   Status: ${j.status}`, { size: 10 });
    line("");
    line("Receiver name: ______________________  Signature: ______________________  Date: ____________", { size: 10 });
  } else {
    return Response.json({ error: "unknown kind" }, { status: 400 });
  }

  const bytes = await pdf.save();
  return new Response(bytes as unknown as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${kind}-${id}.pdf"` },
  });
});
