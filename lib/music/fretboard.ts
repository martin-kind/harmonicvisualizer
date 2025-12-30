import { computeHarmonicsForString, HarmonicMarker } from "./harmonics";
import { KeySignature, isPitchClassInKey } from "./keys";
import { ParsedChord } from "./chords";
import { PitchClass } from "./notes";
import { StringNote } from "./tunings";

export type EnrichedHarmonic = HarmonicMarker & {
  stringIndex: number;
  isInKey: boolean;
  isRoot: boolean;
  inChord: boolean;
};

export function buildFretboardHarmonics(options: {
  tuning: StringNote[];
  key?: KeySignature | null;
  chord?: ParsedChord | null;
}): EnrichedHarmonic[] {
  const { tuning, key, chord } = options;
  return tuning.flatMap((stringNote, stringIndex) => {
    const harmonics = computeHarmonicsForString(stringNote.midi);
    return harmonics.map((h): EnrichedHarmonic => {
      const inKey = key ? isPitchClassInKey(h.pitchClass as PitchClass, key) : false;
      const inChord = chord ? chord.pitchClasses.includes(h.pitchClass) : false;
      return {
        ...h,
        stringIndex,
        isInKey: inKey,
        isRoot: key ? h.pitchClass === key.root : false,
        inChord,
      };
    });
  });
}

