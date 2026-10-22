import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Environment reader that works in Next.js (NEXT_PUBLIC_*) and Expo (EXPO_PUBLIC_*).
 * process.env is accessed statically so bundlers inline the values.
 */
function readEnv(key: "SUPABASE_URL" | "SUPABASE_ANON_KEY"): string | undefined {
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  const env = g.process?.env ?? {};
  return (env[`NEXT_PUBLIC_${key}`] ?? env[`EXPO_PUBLIC_${key}`] ?? undefined) || undefined;
}

export const supabaseUrl = readEnv("SUPABASE_URL");
export const supabaseAnonKey = readEnv("SUPABASE_ANON_KEY");

export function hasSupabaseEnv(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Create a browser/anonymous Supabase client. Throws a friendly error when the
 * project has not been configured yet so apps can render a setup notice.
 */
export function createSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in this app's .env.local (see .env.example).",
    );
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

/** Singleton per-process client for simple web apps. */
let singleton: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!singleton) singleton = createSupabaseClient();
  return singleton;
}
