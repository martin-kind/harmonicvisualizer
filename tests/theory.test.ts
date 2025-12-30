import { describe, expect, it } from "vitest";
import { parseNote } from "@/lib/music/notes";
import { presetTuning } from "@/lib/music/tunings";
import { computeHarmonicsForString, HARMONIC_POINTS } from "@/lib/music/harmonics";
import { keySetFromRoot, isPitchClassInKey } from "@/lib/music/keys";
import { parseChordLocally } from "@/lib/music/chords";

describe("music theory utilities", () => {
  it("parses note names with accidentals", () => {
    expect(parseNote("C#")?.pitchClass).toBe(1);
    expect(parseNote("bb")?.pitchClass).toBe(10);
    expect(parseNote("G3")?.octave).toBe(3);
    expect(parseNote("bad")).toBeNull();
  });

  it("builds standard tuning for six strings", () => {
    const tuning = presetTuning("standard", 6);
    expect(tuning[0].label.startsWith("E")).toBe(true); // low E
    expect(tuning[5].label.startsWith("E")).toBe(true); // high E
  });

  it("maps harmonic points to expected partials", () => {
    const twelve = HARMONIC_POINTS.find((p) => Math.abs(p.fret - 12) < 0.1);
    expect(twelve?.partial).toBe(2);
    const harmonics = computeHarmonicsForString(40); // E2
    expect(harmonics[0].label).toBeDefined();
  });

  it("detects pitch classes in key", () => {
    const key = keySetFromRoot(0, "major"); // C major
    expect(isPitchClassInKey(0, key)).toBe(true);
    expect(isPitchClassInKey(1, key)).toBe(false);
  });

  it("parses common chord locally", () => {
    const chord = parseChordLocally("F#m7b5");
    expect(chord?.pitchClasses).toContain(6); // F#
    expect(chord?.pitchClasses.length).toBeGreaterThan(2);
  });
});

