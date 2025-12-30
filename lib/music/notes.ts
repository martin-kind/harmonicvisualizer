export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

const NOTE_TO_PC: Record<string, PitchClass> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  "E#": 5,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export type ParsedNote = {
  name: string;
  pitchClass: PitchClass;
  octave?: number;
};

export function parseNote(input: string): ParsedNote | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = /^([A-Ga-g])([#b]?)(-?\d+)?$/.exec(trimmed);
  if (!match) return null;
  const [, letter, accidental, octaveRaw] = match;
  const symbol = `${letter.toUpperCase()}${accidental}` as keyof typeof NOTE_TO_PC;
  const pitchClass = NOTE_TO_PC[symbol];
  if (pitchClass === undefined) return null;
  const octave = octaveRaw !== undefined ? Number(octaveRaw) : undefined;
  return {
    name: symbol,
    pitchClass,
    octave: Number.isFinite(octave) ? octave : undefined,
  };
}

export function pitchClassToName(pc: number, preferSharps = true): string {
  const index = ((Math.round(pc) % 12) + 12) % 12;
  return preferSharps ? SHARP_NAMES[index] : FLAT_NAMES[index];
}

export function midiToNote(midi: number, preferSharps = true): ParsedNote {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const pitchClass = ((rounded % 12) + 12) % 12 as PitchClass;
  return {
    name: pitchClassToName(pitchClass, preferSharps),
    pitchClass,
    octave,
  };
}

export function toMidi(pitchClass: PitchClass, octave = 4): number {
  return (octave + 1) * 12 + pitchClass;
}

export function uniquePitchClasses(values: PitchClass[]): PitchClass[] {
  return Array.from(new Set(values.map((v) => ((v % 12) + 12) % 12 as PitchClass)));
}

