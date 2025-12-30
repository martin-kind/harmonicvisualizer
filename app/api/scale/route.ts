import { NextRequest, NextResponse } from "next/server";
import { PitchClass, parseNote } from "@/lib/music/notes";

type LlmScale = {
  label: string;
  root: string;
  notes: string[];
};

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function safeParse(content: string): LlmScale | null {
  try {
    const value = JSON.parse(content);
    if (
      value &&
      typeof value.label === "string" &&
      typeof value.root === "string" &&
      Array.isArray(value.notes)
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
    "You are a music theory assistant. Convert a key/scale description into an ordered list of pitch-class note names using correct enharmonic spellings. Return only JSON.";
  const user =
    `Scale: ${scaleText}\n` +
    `Return JSON with:\n` +
    `- label: a nice display label (e.g. "Gb mixolydian")\n` +
    `- root: root note name (e.g. "Gb")\n` +
    `- notes: ordered array of scale note names as pitch classes only (no octaves), using correct enharmonics for the scale.\n`;

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
            notes: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
            },
          },
          required: ["label", "root", "notes"],
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

  const noteNames = parsed.notes
    .map((n) => parseNote(n)?.name)
    .filter((name): name is string => !!name);

  const pitchClasses = noteNames
    .map((n) => parseNote(n)?.pitchClass)
    .filter((pc): pc is PitchClass => pc !== undefined);

  if (!pitchClasses.length) return null;

  return {
    label: parsed.label,
    rootName: root.name,
    rootPitchClass: root.pitchClass as PitchClass,
    noteNames,
    pitchClasses,
    source: "llm" as const,
  };
}

export async function POST(req: NextRequest) {
  const { scale } = (await req.json()) as { scale?: string };
  if (!scale || typeof scale !== "string") {
    return NextResponse.json({ error: "Scale is required" }, { status: 400 });
  }

  let parsed: Awaited<ReturnType<typeof callLlm>> | null = null;
  try {
    parsed = await callLlm(scale);
  } catch (error) {
    console.error("LLM error", error);
  }

  if (!parsed) {
    return NextResponse.json({ error: "Unable to parse scale" }, { status: 422 });
  }

  return NextResponse.json(parsed);
}


