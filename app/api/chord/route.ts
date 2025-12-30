import { NextRequest, NextResponse } from "next/server";
import { ParsedChord } from "@/lib/music/chords";
import { PitchClass, pitchClassToName, parseNote } from "@/lib/music/notes";

type LlmChord = {
  root: string;
  notes: string[];
};

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function callLlm(chordText: string): Promise<ParsedChord | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const system = `You are a music theory assistant. Convert chord symbols into the set of pitch classes (note names). Return only JSON.`;
  const user = `Chord: ${chordText}\nReturn JSON with root (e.g. "C#", "Gb") and notes array of note names (pitch classes only, no octaves).`;
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
            notes: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
            },
          },
          required: ["root", "notes"],
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

  const pcs = parsed.notes
    .map((n) => parseNote(n)?.pitchClass)
    .filter((pc): pc is PitchClass => pc !== undefined);

  if (!pcs.length) return null;

  return {
    root,
    pitchClasses: pcs,
    label: `${pitchClassToName(root.pitchClass)} chord`,
    source: "llm",
  };
}

function safeParse(content: string): LlmChord | null {
  try {
    const value = JSON.parse(content);
    if (value && typeof value.root === "string" && Array.isArray(value.notes)) {
      return value as LlmChord;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { chord } = (await req.json()) as { chord?: string };
  if (!chord || typeof chord !== "string") {
    return NextResponse.json({ error: "Chord is required" }, { status: 400 });
  }

  let llm: ParsedChord | null = null;

  try {
    llm = await callLlm(chord);
  } catch (error) {
    console.error("LLM error", error);
  }

  if (llm) {
    // Ensure the response always includes a stable `source` field.
    return NextResponse.json({ ...llm, source: "llm" } satisfies ParsedChord);
  }

  return NextResponse.json({ error: "Unable to parse chord" }, { status: 422 });
}

