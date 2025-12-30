import { PitchClass, midiToNote } from "./notes";

export type HarmonicPoint = {
  fret: number;
  partial: number;
  semitoneShift: number;
};

export const HARMONIC_FRETS = [3.2, 4, 5, 7, 9, 12, 16, 19];

function fretForFraction(k: number, n: number): number {
  // position from nut: k/n of the string length
  return -12 * Math.log2(1 - k / n);
}

function nearestPartial(fret: number): HarmonicPoint {
  let best: HarmonicPoint = { fret, partial: 2, semitoneShift: 12 };
  let bestError = Number.POSITIVE_INFINITY;
  for (let n = 2; n <= 12; n += 1) {
    for (let k = 1; k < n; k += 1) {
      const predicted = fretForFraction(k, n);
      const error = Math.abs(predicted - fret);
      if (error < bestError) {
        const semitoneShift = Math.round(12 * Math.log2(n));
        best = { fret, partial: n, semitoneShift };
        bestError = error;
      }
    }
  }
  return best;
}

export const HARMONIC_POINTS: HarmonicPoint[] = HARMONIC_FRETS.map((fret) =>
  nearestPartial(fret),
);

export function harmonicNoteForMidi(midi: number, point: HarmonicPoint) {
  const shifted = midi + point.semitoneShift;
  return midiToNote(shifted);
}

export type HarmonicMarker = {
  fret: number;
  partial: number;
  label: string;
  pitchClass: PitchClass;
  octave?: number;
};

export function computeHarmonicsForString(
  openMidi: number,
  preferSharps = true,
): HarmonicMarker[] {
  return HARMONIC_POINTS.map((point) => {
    const note = midiToNote(openMidi + point.semitoneShift, preferSharps);
    return {
      fret: point.fret,
      partial: point.partial,
      label: `${note.name}${note.octave ?? ""}`,
      pitchClass: note.pitchClass,
      octave: note.octave,
    };
  });
}

