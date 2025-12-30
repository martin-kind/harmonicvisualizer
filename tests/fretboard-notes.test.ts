import { describe, expect, it } from "vitest";
import { presetTuning } from "@/lib/music/tunings";
import { buildFretboardNotes } from "@/lib/music/fretboard";

describe("buildFretboardNotes", () => {
  it("generates one marker per string per fret (0..24)", () => {
    const tuning = presetTuning("standard", 6);
    const markers = buildFretboardNotes({ tuning, fretCount: 24 });
    expect(markers.length).toBe(6 * 25);
  });

  it("computes pitch classes correctly for standard low E string", () => {
    const tuning = presetTuning("standard", 6);
    const markers = buildFretboardNotes({ tuning, fretCount: 1 });
    const lowEOpen = markers.find((m) => m.stringIndex === 0 && m.fret === 0);
    const lowEFret1 = markers.find((m) => m.stringIndex === 0 && m.fret === 1);
    expect(lowEOpen?.pitchClass).toBe(4); // E
    expect(lowEFret1?.pitchClass).toBe(5); // F
  });
});


