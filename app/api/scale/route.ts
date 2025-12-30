import { NextRequest, NextResponse } from "next/server";
import { PitchClass, parseNote } from "@/lib/music/notes";
import { cacheGet, cacheSet, makeCachePrompt, normalizePromptInput } from "@/lib/supabase/cache";

type LlmScale = {
  label: string;
  root: string;
  tones: { note: string; degree: string }[];
};

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const LOG_TIMINGS = process.env.LOG_TIMINGS === "1";

function safeParse(content: string): LlmScale | null {
  try {
    const value = JSON.parse(content);
    if (
      value &&
      typeof value.label === "string" &&
      typeof value.root === "string" &&
      Array.isArray(value.tones)
    ) {
      return value as LlmScale;
    }
    return null;
  } catch {
    return null;
  }
}

async function callLlm(scaleText: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const system =
    "You are a music theory assistant. Convert a key/scale description into scale tones with correct enharmonic spellings and explicit degree labels. Return only JSON.";
  const user =
    `Scale: ${scaleText}\n` +
    `Return JSON with:\n` +
    `- label: a nice display label (e.g. "Gb mixolydian")\n` +
    `- root: root note name (e.g. "Gb")\n` +
    `- tones: ordered array of { note, degree }\n` +
    `  - note: pitch-class note name (no octaves), using correct enharmonics for the scale.\n` +
    `  - degree: scale degree label relative to the root, using 1–7 with optional accidentals (e.g. b3, #4, b5).\n` +
    `    Use chromatic degrees for passing tones if requested.\n`;

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "scale_notes",
        schema: {
          type: "object",
          properties: {
            label: { type: "string" },
            root: { type: "string" },
            tones: {
              type: "array",
              minItems: 2,
              items: {
                type: "object",
                properties: {
                  note: { type: "string" },
                  degree: { type: "string" },
                },
                required: ["note", "degree"],
                additionalProperties: false,
              },
            },
          },
          required: ["label", "root", "tones"],
          additionalProperties: false,
        },
        strict: true,
      },
    },
  };

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = safeParse(content);
  if (!parsed) return null;

  const root = parseNote(parsed.root);
  if (!root) return null;

  const noteNames = parsed.tones
    .map((t) => parseNote(t.note)?.name)
    .filter((name): name is string => !!name);

  const pitchClasses = noteNames
    .map((n) => parseNote(n)?.pitchClass)
    .filter((pc): pc is PitchClass => pc !== undefined);

  if (!pitchClasses.length) return null;

  const degreeMap: Record<string, string> = {};
  for (const t of parsed.tones) {
    const n = parseNote(t.note);
    if (!n) continue;
    const key = String(n.pitchClass);
    if (!degreeMap[key]) degreeMap[key] = t.degree;
  }
  degreeMap[String(root.pitchClass)] = "1";

  return {
    label: parsed.label,
    rootName: root.name,
    rootPitchClass: root.pitchClass as PitchClass,
    noteNames,
    pitchClasses,
    degreeMap,
    source: "llm" as const,
  };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const { scale } = (await req.json()) as { scale?: string };
  if (!scale || typeof scale !== "string") {
    return NextResponse.json({ error: "Scale is required" }, { status: 400 });
  }
  const normalizedScale = normalizePromptInput(scale);

  // Cross-user cache (Supabase) keyed by (schema version, model, input)
  const cachePrompt = makeCachePrompt("scale", OPENAI_MODEL, normalizedScale);
  const tCacheGet0 = Date.now();
  const cached = await cacheGet(cachePrompt);
  const cacheGetMs = Date.now() - tCacheGet0;
  if (cached && typeof cached === "object") {
    if (LOG_TIMINGS) {
      console.info("[timing] api/scale", { cache: "HIT", cacheGetMs, totalMs: Date.now() - t0 });
    }
    return NextResponse.json(cached, { headers: { "x-cache": "HIT", "x-cache-key": cachePrompt } });
  }

  let parsed: Awaited<ReturnType<typeof callLlm>> | null = null;
  try {
    const tLlm0 = Date.now();
    parsed = await callLlm(normalizedScale);
    if (LOG_TIMINGS) {
      console.info("[timing] api/scale", {
        cache: "MISS",
        cacheGetMs,
        openaiMs: Date.now() - tLlm0,
      });
    }
  } catch (error) {
    console.error("LLM error", error);
  }

  if (!parsed) {
    if (LOG_TIMINGS) {
      console.info("[timing] api/scale", {
        cache: "MISS",
        cacheGetMs,
        totalMs: Date.now() - t0,
        result: "no-parse",
      });
    }
    return NextResponse.json({ error: "Unable to parse scale" }, { status: 422 });
  }

  const tCacheSet0 = Date.now();
  const write = await cacheSet(cachePrompt, parsed);
  const cacheSetMs = Date.now() - tCacheSet0;
  if (!write.ok) {
    console.warn("[cache] scale write failed:", write.error);
    if (LOG_TIMINGS) {
      console.info("[timing] api/scale", {
        cache: "MISS",
        cacheGetMs,
        cacheSetMs,
        cacheWrite: "ERR",
        totalMs: Date.now() - t0,
      });
    }
    return NextResponse.json(parsed, {
      headers: {
        "x-cache": "MISS",
        "x-cache-key": cachePrompt,
        "x-cache-write": "ERR",
        "x-cache-write-error": write.error,
      },
    });
  }
  if (LOG_TIMINGS) {
    console.info("[timing] api/scale", {
      cache: "MISS",
      cacheGetMs,
      cacheSetMs,
      cacheWrite: "OK",
      totalMs: Date.now() - t0,
    });
  }
  return NextResponse.json(parsed, {
    headers: { "x-cache": "MISS", "x-cache-key": cachePrompt, "x-cache-write": "OK" },
  });
}


