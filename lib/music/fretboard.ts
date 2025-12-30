import { computeHarmonicsForString, HarmonicMarker } from "./harmonics";
import { ParsedChord } from "./chords";
import { PitchClass, midiToNote } from "./notes";
import { StringNote } from "./tunings";

export type FretboardMarker = {
  fret: number;
  label: string;
  pitchClass: PitchClass;
  partial?: number;
  stringIndex: number;
  isInKey: boolean;
  isRoot: boolean;
  inChord: boolean;
};

type EnrichedHarmonic = HarmonicMarker & {
  stringIndex: number;
  isInKey: boolean;
  isRoot: boolean;
  inChord: boolean;
};

export function buildFretboardHarmonics(options: {
  tuning: StringNote[];
  key?: { root: PitchClass; scale: PitchClass[] } | null;
  chord?: ParsedChord | null;
}): FretboardMarker[] {
  const { tuning, key, chord } = options;
  return tuning.flatMap((stringNote, stringIndex) => {
    const harmonics = computeHarmonicsForString(stringNote.midi);
    return harmonics.map((h): FretboardMarker => {
      const inKey = key ? key.scale.includes(h.pitchClass as PitchClass) : false;
      const inChord = chord ? chord.pitchClasses.includes(h.pitchClass) : false;
      return {
        fret: h.fret,
        label: h.label,
        pitchClass: h.pitchClass as PitchClass,
        partial: h.partial,
        stringIndex,
        isInKey: inKey,
        isRoot: key ? h.pitchClass === key.root : false,
        inChord,
      };
    });
  });
}

export function buildFretboardNotes(options: {
  tuning: StringNote[];
  key?: { root: PitchClass; scale: PitchClass[] } | null;
  chord?: ParsedChord | null;
  fretCount: number;
}): FretboardMarker[] {
  const { tuning, key, chord, fretCount } = options;
  return tuning.flatMap((stringNote, stringIndex) => {
    const markers: FretboardMarker[] = [];
    for (let fret = 0; fret <= fretCount; fret += 1) {
      const note = midiToNote(stringNote.midi + fret, true);
      const pc = note.pitchClass;
      const inKey = key ? key.scale.includes(pc) : false;
      const inChord = chord ? chord.pitchClasses.includes(pc) : false;
      markers.push({
        fret,
        label: note.name,
        pitchClass: pc,
        stringIndex,
        isInKey: inKey,
        isRoot: key ? pc === key.root : false,
        inChord,
      });
    }
    return markers;
  });
}

