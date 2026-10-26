import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Module-scoped ambient type for Node's `process` global. Declared inside this
// module so it can never conflict with @types/node in consuming apps, and it is
// erased at build time. The base tsconfig does not include node types.
declare const process: { env: Record<string, string | undefined> };

/**
 * Supabase config MUST be read through literal `process.env.<VAR>` member
 * expressions. Next.js only inlines `process.env.NEXT_PUBLIC_*` and Expo only
 * inlines `process.env.EXPO_PUBLIC_*` into the client bundle when they appear as
 * static references. Dynamic access (env[`NEXT_PUBLIC_${key}`]) is never replaced
 * at build time, so the browser receives undefined while SSR sees the real values
 * from the Node process env — that mismatch between server and client is what
 * caused hasSupabaseEnv() to differ and triggered the React hydration error.
 */
function firstEnv(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

export const supabaseUrl = firstEnv(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_URL,
);

export const supabaseAnonKey = firstEnv(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);

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
