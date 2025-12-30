import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

type CacheRow = {
  prompt: string;
  response: string;
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer server-only key when present (recommended for RLS-protected cache table).
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return { url, key };
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function normalizePromptInput(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

export function makeCachePrompt(kind: "chord" | "scale", model: string, input: string) {
  const normalized = normalizePromptInput(input);
  const schemaVersion = kind === "chord" ? "chord:v2" : "scale:v2";
  const raw = `${schemaVersion}|model=${model}|input=${normalized}`;
  // Keep prompt bounded in length, and include raw prefix for easy debugging in Supabase.
  return `${schemaVersion}:${sha256(raw)}`;
}

export async function cacheGet(prompt: string): Promise<unknown | null> {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  const supabase = createClient(cfg.url, cfg.key, { auth: { persistSession: false } });

  // Be tolerant if duplicates ever existed (e.g. before UNIQUE(prompt) was added).
  // `limit(1)` guarantees `maybeSingle()` won't error due to multiple rows.
  const { data, error } = await supabase
    .from("cache")
    .select("response")
    .eq("prompt", prompt)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as Pick<CacheRow, "response">;
  try {
    return JSON.parse(row.response);
  } catch {
    return null;
  }
}

export async function cacheSet(
  prompt: string,
  value: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = getSupabaseConfig();
  if (!cfg) return { ok: false, error: "Supabase env not configured" };
  const supabase = createClient(cfg.url, cfg.key, { auth: { persistSession: false } });

  const response = JSON.stringify(value);

  // With UNIQUE(prompt) this is race-safe.
  const { error } = await supabase
    .from("cache")
    .upsert({ prompt, response } satisfies CacheRow, { onConflict: "prompt" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}


