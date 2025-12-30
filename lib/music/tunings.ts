import { PitchClass, midiToNote, parseNote, pitchClassToName, toMidi } from "./notes";

export type TuningPreset = "standard" | "fourths" | "custom";

export type StringNote = {
  label: string;
  pitchClass: PitchClass;
  midi: number;
};

export type TuningResult = {
  strings: StringNote[];
  errors: string[];
};

const STANDARD_BASE: number[] = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (low -> high)
const FOURTHS_BASE: number[] = [40, 45, 50, 55, 60, 65]; // E2 A2 D3 G3 C4 F4

// For 4/5 string selections we treat this as "bass-like" by default:
// low string should be E (per user feedback).
const BASS_4_BASE: number[] = [28, 33, 38, 43]; // E1 A1 D2 G2
const BASS_5_BASE: number[] = [28, 33, 38, 43, 48]; // E1 A1 D2 G2 C3

function expandLowStrings(base: number[], stringCount: number): number[] {
  if (stringCount <= base.length) {
    return base.slice(base.length - stringCount);
  }
  const extended = [...base];
  while (extended.length < stringCount) {
    const lowest = extended[0];
    extended.unshift(lowest - 5); // add another fourth/fifth below
  }
  return extended;
}

export function presetTuning(preset: TuningPreset, stringCount: number): StringNote[] {
  const base =
    stringCount === 4
      ? BASS_4_BASE
      : stringCount === 5
        ? BASS_5_BASE
        : preset === "fourths"
          ? FOURTHS_BASE
          : STANDARD_BASE;
  const values = expandLowStrings(base, stringCount);
  return values.map((midi) => {
    const note = midiToNote(midi);
    return {
      label: note.name,
      midi,
      pitchClass: note.pitchClass,
    };
  });
}

export function parseCustomTuning(inputs: string[], fallbackOctave = 3): TuningResult {
  const strings: StringNote[] = [];
  const errors: string[] = [];
  inputs.forEach((value, index) => {
    const parsed = parseNote(value);
    if (!parsed) {
      errors.push(`String ${index + 1}: invalid note "${value || ""}"`);
      return;
    }
    const octave = parsed.octave ?? fallbackOctave;
    const midi = toMidi(parsed.pitchClass, octave);
    strings.push({
      label: pitchClassToName(parsed.pitchClass),
      pitchClass: parsed.pitchClass,
      midi,
    });
  });
  return { strings, errors };
}

export function buildTuning(options: {
  preset: TuningPreset;
  stringCount: number;
  customInputs?: string[];
}): TuningResult {
  const { preset, stringCount, customInputs = [] } = options;
  if (preset === "custom") {
    const normalizedInputs =
      customInputs.length === stringCount
        ? customInputs
        : [...customInputs, ...Array(stringCount - customInputs.length).fill("C3")];
    return parseCustomTuning(normalizedInputs);
  }
  return { strings: presetTuning(preset, stringCount), errors: [] };
}

