import { ParsedNote, PitchClass, parseNote, pitchClassToName, uniquePitchClasses } from "./notes";

export type ParsedChord = {
  root: ParsedNote;
  // Optional: when produced by the LLM we can preserve enharmonic spellings.
  // These are note names without octaves, e.g. ["Gb","Bb","Db","E"].
  noteNames?: string[];
  rootName?: string;
  pitchClasses: PitchClass[];
  label: string;
  source: "local" | "llm";
};

const QUALITY_MAP: Record<string, number[]> = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  M: [0, 4, 7],
  "+": [0, 4, 8],
  aug: [0, 4, 8],
  m: [0, 3, 7],
  min: [0, 3, 7],
  "-": [0, 3, 7],
  dim: [0, 3, 6],
  o: [0, 3, 6],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

function addExtension(intervals: number[], ext: number) {
  if (!intervals.includes(ext)) intervals.push(ext);
}

export function parseChordLocally(input: string): ParsedChord | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = /^([A-Ga-g][#b]?)(.*)$/.exec(trimmed);
  if (!match) return null;
  const rootSymbol = match[1];
  const qualityRaw = match[2].trim();
  const root = parseNote(rootSymbol);
  if (!root) return null;

  let qualityKey = "";
  let remainder = qualityRaw;
  const susMatch = /^sus(2|4)/.exec(qualityRaw);
  if (susMatch) {
    qualityKey = `sus${susMatch[1]}`;
    remainder = qualityRaw.slice(qualityKey.length);
  } else {
    const qMatch = /^(maj|min|dim|aug|M|m|\+|-|o)/.exec(qualityRaw);
    if (qMatch) {
      qualityKey = qMatch[1];
      remainder = qualityRaw.slice(qualityKey.length);
    }
  }

  const base = QUALITY_MAP[qualityKey];
  if (!base) return null;
  const intervals = [...base];

  const hasMaj7 = /maj7|Δ7|M7/.test(remainder);
  const hasDom7 = /(^|[^a-zA-Z])7/.test(remainder) && !hasMaj7;
  const hasMin7 = qualityKey.startsWith("m") && hasDom7;

  if (hasMaj7) addExtension(intervals, 11);
  else if (hasDom7 || hasMin7) addExtension(intervals, 10);

  if (/9/.test(remainder)) addExtension(intervals, 14);
  if (/11/.test(remainder)) addExtension(intervals, 17);
  if (/13/.test(remainder)) addExtension(intervals, 21);
  if (/b9/.test(remainder)) addExtension(intervals, 13);
  if (/b13/.test(remainder)) addExtension(intervals, 20);
  if (/b5/.test(remainder) || /dim5/.test(remainder)) {
    const idx = intervals.indexOf(7);
    if (idx >= 0) intervals[idx] = 6;
  }
  if (/#5/.test(remainder) || /\+5/.test(remainder)) {
    const idx = intervals.indexOf(7);
    if (idx >= 0) intervals[idx] = 8;
  }

  const pcs = uniquePitchClasses(
    intervals.map((i) => (((root.pitchClass + i) % 12) + 12) % 12 as PitchClass),
  );

  return {
    root,
    pitchClasses: pcs,
    label: `${pitchClassToName(root.pitchClass)}${qualityRaw}`,
    source: "local",
  };
}

