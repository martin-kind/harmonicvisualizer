import { PitchClass, pitchClassToName } from "./notes";

export type Mode = "major" | "minor";

export type KeySignature = {
  root: PitchClass;
  label: string;
  mode: Mode;
  scale: PitchClass[];
};

const MAJOR_INTERVALS: PitchClass[] = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS: PitchClass[] = [0, 2, 3, 5, 7, 8, 10];

function buildScale(root: PitchClass, mode: Mode): PitchClass[] {
  const intervals = mode === "major" ? MAJOR_INTERVALS : MINOR_INTERVALS;
  return intervals.map((n) => ((root + n) % 12) as PitchClass);
}

export function keySetFromRoot(root: PitchClass, mode: Mode): KeySignature {
  return {
    root,
    label: `${pitchClassToName(root)} ${mode}`,
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

