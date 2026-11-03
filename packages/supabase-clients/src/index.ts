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

// ── Custom auth token store ──────────────────────────────────────────────────
// Portals no longer use Supabase Auth (GoTrue). Instead our login Edge Function
// mints an HS256 JWT signed with the project's JWT secret whose `sub` is the
// profile id; we inject it as `Authorization: Bearer <jwt>` on every request so
// PostgREST/Realtime still resolve auth.uid() and all existing RLS keeps working.

/** Async/sync key-value adapter: web uses localStorage, the driver app uses SQLite. */
export type TokenStorage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

const TOKEN_KEY = "hericilla_auth_token";

let tokenStorage: TokenStorage | null = null;
let memoryToken: string | null = null;
let hydrated = false;

/** Inject the platform-specific persistence adapter before first use. */
export function configureTokenStorage(storage: TokenStorage): void {
  tokenStorage = storage;
}

/** Synchronous read used by the custom fetch — must reflect the latest token. */
export function getAuthToken(): string | null {
  return memoryToken;
}

export function setAuthToken(token: string): void {
  memoryToken = token;
  hydrated = true;
  void tokenStorage?.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  memoryToken = null;
  hydrated = true;
  void tokenStorage?.removeItem(TOKEN_KEY);
}

/** Restore the persisted token into memory at app boot. Returns the token if any. */
export async function restoreAuthToken(): Promise<string | null> {
  if (hydrated) return memoryToken;
  hydrated = true;
  if (tokenStorage) {
    try {
      const stored = await tokenStorage.getItem(TOKEN_KEY);
      if (stored) memoryToken = stored;
    } catch {
      /* storage unavailable — treat as signed out */
    }
  }
  return memoryToken;
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Pure-JS base64url decode (works in browser and React Native — no atob/Buffer). */
function b64UrlDecode(input: string): string {
  const data = input.replace(/-/g, "+").replace(/_/g, "/");
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const ch of data) {
    if (ch === "=") break;
    const val = B64_CHARS.indexOf(ch);
    if (val === -1) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return decodeURIComponent(
    output
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
}

/**
 * Decode a JWT's payload for client-side UI hints (`sub`, `role`, `must_reset`).
 * NO signature verification happens here — enforcement stays in RLS and the
 * Edge Functions. This only tells the UI who is signed in.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(b64UrlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Create a browser/anonymous Supabase client. Throws a friendly error when the
 * project has not been configured yet so apps can render a setup notice.
 *
 * The custom `fetch` injects the current auth token as `Authorization` so every
 * PostgREST/Storage/Realtime call carries the custom JWT (auth.uid() = token.sub).
 */
export function createSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in this app's .env.local (see .env.example).",
    );
  }
  const baseFetch = globalThis.fetch.bind(globalThis);
  return createClient(supabaseUrl, supabaseAnonKey, {
    // supabase-js must never manage a GoTrue session — auth is fully custom.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: URL | RequestInfo, init?: RequestInit) => {
        const headers = new Headers(init?.headers ?? {});
        const token = getAuthToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        headers.set("apikey", supabaseAnonKey);
        return baseFetch(input, { ...init, headers });
      },
    },
  });
}

/** Singleton per-process client for simple web apps. */
let singleton: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!singleton) singleton = createSupabaseClient();
  return singleton;
}

/** An error carrying the HTTP status and parsed body from an auth Edge Function. */
export class AuthFunctionError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.name = "AuthFunctionError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Call an auth Edge Function with a raw fetch. Attaches apikey always and the custom
 * bearer token when present. Throws AuthFunctionError (with status + body) on non-2xx
 * so callers can branch on 401/403 and surface the function's friendly message.
 */
export async function invokeAuthFunction<T = Record<string, unknown>>(
  name: string,
  body?: unknown,
): Promise<T> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured.");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: supabaseAnonKey,
  };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new AuthFunctionError(
      typeof data.error === "string" ? data.error : "Request failed.",
      res.status,
      data,
    );
  }
  return data as T;
}
