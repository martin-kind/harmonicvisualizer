import { NextRequest, NextResponse } from "next/server";
import { ParsedChord } from "@/lib/music/chords";
import { PitchClass, pitchClassToName, parseNote } from "@/lib/music/notes";
import { cacheGet, cacheSet, makeCachePrompt, normalizePromptInput } from "@/lib/supabase/cache";

type LlmChord = {
  root: string;
  tones: { note: string; degree: string }[];
};

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const LOG_TIMINGS = process.env.LOG_TIMINGS === "1";

async function callLlm(chordText: string): Promise<ParsedChord | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const system =
    "You are a music theory assistant. Convert chord symbols into chord tones with correct enharmonic spellings and explicit chord-degree labels. Return only JSON.";
  const user =
    `Chord: ${chordText}\n` +
    `Return JSON with:\n` +
    `- root: root note name (pitch class only, no octave), e.g. "C#", "Gb"\n` +
    `- tones: array of objects { note, degree }\n` +
    `  - note: pitch-class note name (no octave), spelled consistently with the chord symbol.\n` +
    `  - degree: chord degree label. Use extensions when appropriate (9/11/13) and alterations like b9/#9/#11/b13.\n` +
    `    Examples: 1, b3, 3, 5, b7, 7, 9, b9, #9, 11, #11, 13, b13\n`;
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "chord_notes",
        schema: {
          type: "object",
          properties: {
            root: { type: "string" },
            tones: {
              type: "array",
              minItems: 1,
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
          required: ["root", "tones"],
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

  const pcs = noteNames
    .map((n) => parseNote(n)?.pitchClass)
    .filter((pc): pc is PitchClass => pc !== undefined);

  if (!pcs.length) return null;

  const degreeMap: Record<string, string> = {};
  for (const t of parsed.tones) {
    const n = parseNote(t.note);
    if (!n) continue;
    const key = String(n.pitchClass);
    if (!degreeMap[key]) degreeMap[key] = t.degree;
  }
  degreeMap[String(root.pitchClass)] = "1";

  return {
    root,
    rootName: root.name,
    noteNames,
    degreeMap,
    pitchClasses: pcs,
    label: `${root.name} chord`,
    source: "llm",
  };
}

function safeParse(content: string): LlmChord | null {
  try {
    const value = JSON.parse(content);
    if (value && typeof value.root === "string" && Array.isArray(value.tones)) {
      return value as LlmChord;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const { chord } = (await req.json()) as { chord?: string };
  if (!chord || typeof chord !== "string") {
    return NextResponse.json({ error: "Chord is required" }, { status: 400 });
  }
  const normalizedChord = normalizePromptInput(chord);

  // Cross-user cache (Supabase) keyed by (schema version, model, input)
  const cachePrompt = makeCachePrompt("chord", OPENAI_MODEL, normalizedChord);
  const tCacheGet0 = Date.now();
  const cached = await cacheGet(cachePrompt);
  const cacheGetMs = Date.now() - tCacheGet0;
  if (cached && typeof cached === "object") {
    if (LOG_TIMINGS) {
      console.info("[timing] api/chord", {
        cache: "HIT",
        cacheGetMs,
        totalMs: Date.now() - t0,
      });
    }
    return NextResponse.json(cached, { headers: { "x-cache": "HIT", "x-cache-key": cachePrompt } });
  }

  let llm: ParsedChord | null = null;

  try {
    const tLlm0 = Date.now();
    llm = await callLlm(normalizedChord);
    if (LOG_TIMINGS) {
      console.info("[timing] api/chord", {
        cache: "MISS",
        cacheGetMs,
        openaiMs: Date.now() - tLlm0,
      });
    }
  } catch (error) {
    console.error("LLM error", error);
  }

  if (llm) {
    // Ensure the response always includes a stable `source` field.
    const payload = { ...llm, source: "llm" } satisfies ParsedChord;
    const tCacheSet0 = Date.now();
    const write = await cacheSet(cachePrompt, payload);
    const cacheSetMs = Date.now() - tCacheSet0;
    if (!write.ok) {
      console.warn("[cache] chord write failed:", write.error);
      if (LOG_TIMINGS) {
        console.info("[timing] api/chord", {
          cache: "MISS",
          cacheGetMs,
          cacheSetMs,
          cacheWrite: "ERR",
          totalMs: Date.now() - t0,
        });
      }
      return NextResponse.json(payload, {
        headers: {
          "x-cache": "MISS",
          "x-cache-key": cachePrompt,
          "x-cache-write": "ERR",
          "x-cache-write-error": write.error,
        },
      });
    }
    if (LOG_TIMINGS) {
      console.info("[timing] api/chord", {
        cache: "MISS",
        cacheGetMs,
        cacheSetMs,
        cacheWrite: "OK",
        totalMs: Date.now() - t0,
      });
    }
    return NextResponse.json(payload, {
      headers: { "x-cache": "MISS", "x-cache-key": cachePrompt, "x-cache-write": "OK" },
    });
  }

  if (LOG_TIMINGS) {
    console.info("[timing] api/chord", {
      cache: "MISS",
      cacheGetMs,
      totalMs: Date.now() - t0,
      result: "no-parse",
    });
  }
  return NextResponse.json({ error: "Unable to parse chord" }, { status: 422 });
}

