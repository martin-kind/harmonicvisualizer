import { PitchClass, pitchClassToName } from "./notes";

export type Mode = "major" | "minor";

export type KeySignature = {
  root: PitchClass;
  label: string;
  mode: Mode;
  scale: PitchClass[];
};

const MAJOR_KEY_NAME: Record<PitchClass, string> = {
  0: "C",
  1: "Db",
  2: "D",
  3: "Eb",
  4: "E",
  5: "F",
  6: "F#",
  7: "G",
  8: "Ab",
  9: "A",
  10: "Bb",
  11: "B",
};

const MINOR_KEY_NAME: Record<PitchClass, string> = {
  0: "C",
  1: "C#",
  2: "D",
  3: "Eb",
  4: "E",
  5: "F",
  6: "F#",
  7: "G",
  8: "G#",
  9: "A",
  10: "Bb",
  11: "B",
};

const MAJOR_INTERVALS: PitchClass[] = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS: PitchClass[] = [0, 2, 3, 5, 7, 8, 10];

function buildScale(root: PitchClass, mode: Mode): PitchClass[] {
  const intervals = mode === "major" ? MAJOR_INTERVALS : MINOR_INTERVALS;
  return intervals.map((n) => ((root + n) % 12) as PitchClass);
}

export function keySetFromRoot(root: PitchClass, mode: Mode): KeySignature {
  const displayName =
    mode === "major"
      ? MAJOR_KEY_NAME[root] ?? pitchClassToName(root)
      : MINOR_KEY_NAME[root] ?? pitchClassToName(root);
  return {
    root,
    label: `${displayName} ${mode}`,
    mode,
    scale: buildScale(root, mode),
  };
}

export const ALL_KEYS: KeySignature[] = (() => {
  const keys: KeySignature[] = [];
  for (let pc = 0; pc < 12; pc += 1) {
    keys.push(keySetFromRoot(pc as PitchClass, "major"));
    keys.push(keySetFromRoot(pc as PitchClass, "minor"));
  }
  return keys;
})();

export function isPitchClassInKey(pc: PitchClass, key?: KeySignature | null): boolean {
  if (!key) return false;
  return key.scale.includes(((pc % 12) + 12) % 12 as PitchClass);
}

