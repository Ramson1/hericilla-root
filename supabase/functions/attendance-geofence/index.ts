// attendance-geofence — server-side verdict for clock events.
// The client sends its JWT + coordinates + target site/work-order; the function
// loads the site fence, computes haversine distance and returns the verdict,
// then calls the clock_event() RPC as the user (RLS-safe, append-only).
// Env: SUPABASE_URL, SUPABASE_ANON_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
  const jwt = req.headers.get("authorization");
  if (!jwt) return Response.json({ error: "missing auth header" }, { status: 401 });

  // Act as the caller so the clock_event RPC sees auth.uid()
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { authorization: jwt } } },
  );
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user) return Response.json({ error: "invalid session" }, { status: 401 });

  const body = await req.json();
  const {
    event_type, work_order_id, site_id, shift_id,
    gps_lat, gps_lng, event_id, original_event_time, source,
  } = body;
  if (!event_type) return Response.json({ error: "event_type required" }, { status: 400 });

  // Resolve target fence: explicit site, or the site on the work order / assignment
  let target: { lat: number | null; lng: number | null; radius_m: number } | null = null;
  let site = site_id;
  if (!site && work_order_id) {
    // a work order's fence comes from today's shift assignment for it, if any
    const { data: sa } = await supabase
      .from("hericilla_shift_assignments").select("site_id")
      .eq("work_order_id", work_order_id)
      .eq("work_date", new Date().toISOString().slice(0, 10))
      .not("site_id", "is", null)
      .limit(1).maybeSingle();
    site = sa?.site_id ?? null;
  }
  if (!site && shift_id) {
    const { data: sh } = await supabase.from("hericilla_shifts").select("default_site_id").eq("id", shift_id).single();
    site = sh?.default_site_id ?? null;
  }
  if (site) {
    const { data: s } = await supabase.from("hericilla_sites").select("lat, lng, radius_m").eq("id", site).single();
    if (s) target = s;
  }

  // Config: geofence enforcement can be softened via app_settings
  const { data: setting } = await supabase
    .from("hericilla_app_settings").select("value").eq("key", "attendance_enforce_geofence").single();
  const enforce = setting?.value !== false;

  let verdict: "verified" | "outside" | "unchecked" = "unchecked";
  let distance: number | null = null;
  if (target && target.lat != null && target.lng != null && gps_lat != null && gps_lng != null) {
    distance = haversineMeters(gps_lat, gps_lng, target.lat, target.lng);
    verdict = distance <= target.radius_m ? "verified" : "outside";
  }

  if (verdict === "outside" && enforce) {
    return Response.json({
      ok: false,
      geofence_result: "outside",
      distance_m: Math.round(distance!),
      message: "You are outside the allowed area for this assignment.",
    });
  }

  // Append the event through the user-scoped RPC (dedupes offline replays)
  const { data: eventId, error } = await supabase.rpc("hericilla_clock_event", {
    p_type: event_type,
    p_work_order: work_order_id ?? null,
    p_site: site ?? null,
    p_shift: shift_id ?? null,
    p_gps_lat: gps_lat ?? null,
    p_gps_lng: gps_lng ?? null,
    p_event_id: event_id ?? crypto.randomUUID(),
    p_original_time: original_event_time ?? null,
    p_source: source ?? "web",
  });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });

  return Response.json({ ok: true, attendance_event_id: eventId, geofence_result: verdict, distance_m: distance != null ? Math.round(distance) : null });
});
