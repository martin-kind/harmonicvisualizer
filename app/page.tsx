"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TuningPreset, buildTuning } from "@/lib/music/tunings";
import { buildFretboardHarmonics, EnrichedHarmonic } from "@/lib/music/fretboard";
import { ParsedChord } from "@/lib/music/chords";
import { parseNote, PitchClass, pitchClassToName } from "@/lib/music/notes";

type UiChord = {
  data: ParsedChord | null;
  source: "none" | "loading" | "error" | "success";
  message?: string;
};

type ParsedScale = {
  label: string;
  rootName: string;
  rootPitchClass: PitchClass;
  noteNames: string[];
  pitchClasses: PitchClass[];
  source: "llm";
};

type UiScale = {
  data: ParsedScale | null;
  source: "none" | "loading" | "error" | "success";
  message?: string;
};

const tuningPresetOptions: { id: TuningPreset; label: string; description: string }[] = [
  { id: "standard", label: "Standard", description: "EADGBE" },
  { id: "fourths", label: "All fourths", description: "EADGCF..." },
  { id: "custom", label: "Custom", description: "Enter note per string" },
];

export default function Home() {
  const [stringCount, setStringCount] = useState(6);
  const [preset, setPreset] = useState<TuningPreset>("standard");
  const [customInputs, setCustomInputs] = useState<string[]>(Array(8).fill(""));
  const [activeTab, setActiveTab] = useState<"scale" | "chord">("scale");

  const [scaleText, setScaleText] = useState("");
  const [scale, setScale] = useState<UiScale>({ data: null, source: "none" });

  const [chordText, setChordText] = useState("");
  const [chord, setChord] = useState<UiChord>({ data: null, source: "none" });
  const hasAutoEnabledInKey = useRef(false);
  const [labelMode, setLabelMode] = useState<"notes" | "degrees">("notes");

  useEffect(() => {
    if (!hasAutoEnabledInKey.current) {
      hasAutoEnabledInKey.current = true;
    }
  }, []);

  const tuningResult = useMemo(
    () =>
      buildTuning({
        preset,
        stringCount,
        customInputs: customInputs.slice(0, stringCount),
      }),
    [preset, stringCount, customInputs],
  );

  const harmonics: EnrichedHarmonic[] = useMemo(() => {
    return buildFretboardHarmonics({
      tuning: tuningResult.strings,
      key:
        activeTab === "scale" && scale.data
          ? {
              root: scale.data.rootPitchClass,
              scale: scale.data.pitchClasses,
            }
          : null,
      chord: activeTab === "chord" ? chord.data : null,
    });
  }, [tuningResult.strings, activeTab, chord.data, scale.data]);

  const fretMarkers = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);

  async function analyzeChord() {
    const trimmed = chordText.trim();
    if (!trimmed) {
      setChord({ data: null, source: "none" });
      return;
    }
    setScale({ data: null, source: "none" });
    setScaleText("");
    setChord({ data: null, source: "loading" });
    try {
      const res = await fetch("/api/chord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chord: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json();
        setChord({
          data: null,
          source: "error",
          message: body?.error ?? "Could not parse chord",
        });
        return;
      }
      const data = (await res.json()) as ParsedChord;
      setChord({ data, source: "success" });
    } catch (error) {
      console.error(error);
      setChord({ data: null, source: "error", message: "Network or LLM error" });
    }
  }

  async function analyzeScale() {
    const trimmed = scaleText.trim();
    if (!trimmed) {
      setScale({ data: null, source: "none" });
      return;
    }
    setChord({ data: null, source: "none" });
    setChordText("");
    setScale({ data: null, source: "loading" });
    try {
      const res = await fetch("/api/scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scale: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json();
        setScale({ data: null, source: "error", message: body?.error ?? "Could not parse scale" });
        return;
      }
      const data = (await res.json()) as ParsedScale;
      setScale({ data, source: "success" });
    } catch (error) {
      console.error(error);
      setScale({ data: null, source: "error", message: "Network or LLM error" });
    }
  }

  type DisplayMode = "all" | "key" | "chord";
  const mode: DisplayMode =
    activeTab === "chord" ? (chord.data ? "chord" : "all") : scale.data ? "key" : "all";

  const noteNameMap: Record<string, string> | null = useMemo(() => {
    const names =
      mode === "chord" ? chord.data?.noteNames : mode === "key" ? scale.data?.noteNames : null;
    if (!names) return null;
    const map: Record<string, string> = {};
    for (const raw of names) {
      const parsed = parseNote(raw);
      if (!parsed) continue;
      const key = String(parsed.pitchClass);
      if (!map[key]) map[key] = parsed.name;
    }
    return map;
  }, [mode, chord.data?.noteNames, scale.data?.noteNames]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Guitar Harmonic Finder</h1>
          <p className="text-sm text-slate-600">
            Configure your guitar, view natural harmonics from frets 0–24, and highlight notes that
            fit a key or chord.
          </p>
        </header>

        <section className="grid gap-4 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2">
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">
              Strings (4–8)
              <input
                type="number"
                min={4}
                max={8}
                value={stringCount}
                onChange={(e) => setStringCount(Math.min(8, Math.max(4, Number(e.target.value))))}
                className="mt-1 w-20 rounded border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Tuning</p>
              <div className="flex flex-wrap gap-2">
                {tuningPresetOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setPreset(opt.id)}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      preset === opt.id
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {tuningPresetOptions.find((o) => o.id === preset)?.description}
              </p>
            </div>

            {preset === "custom" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Custom tuning (low → high)</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Array.from({ length: stringCount }).map((_, idx) => (
                    <input
                      key={idx}
                      placeholder={`String ${idx + 1}`}
                      value={customInputs[idx] ?? ""}
                      onChange={(e) => {
                        const next = [...customInputs];
                        next[idx] = e.target.value;
                        setCustomInputs(next);
                      }}
                      className="rounded border border-slate-200 px-3 py-2 text-sm"
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-500">Accepts note names like C, Eb, F#.</p>
              </div>
            )}

            {tuningResult.errors.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {tuningResult.errors.join("; ")}
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-slate-700">Tuning preview</p>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-700">
                {tuningResult.strings.map((s, idx) => (
                  <span key={`${s.label}-${idx}`} className="rounded bg-slate-100 px-2 py-1">
                    {idx + 1}: {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("scale");
                  setChord({ data: null, source: "none" });
                  setChordText("");
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  activeTab === "scale"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                Scale / Key
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("chord");
                  setScale({ data: null, source: "none" });
                  setScaleText("");
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  activeTab === "chord"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                Chord
              </button>
            </div>

            {activeTab === "scale" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Scale / Key (AI-assisted)</p>
                <div className="flex gap-2">
                  <input
                    value={scaleText}
                    onChange={(e) => setScaleText(e.target.value)}
                    placeholder='e.g. "Gb mixolydian", "D melodic minor", "C major pentatonic"'
                    className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={analyzeScale}
                    className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
                  >
                    Analyze
                  </button>
                </div>
                {scale.source === "loading" && <p className="text-xs text-slate-500">Calling /api/scale…</p>}
                {scale.source === "error" && (
                  <p className="text-xs text-amber-700">{scale.message ?? "Could not parse scale"}</p>
                )}
                {scale.data && (
                  <div className="text-xs text-slate-600">
                    {scale.data.label}: {scale.data.noteNames.join(", ")} ({scale.data.source})
                  </div>
                )}
              </div>
            )}

            {activeTab === "chord" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Chord (AI-assisted)</p>
              <div className="flex gap-2">
                <input
                  value={chordText}
                  onChange={(e) => setChordText(e.target.value)}
                  placeholder="e.g. G13#11, F#m7b5"
                  className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  onClick={analyzeChord}
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
                >
                  Analyze
                </button>
              </div>
              {chord.source === "loading" && (
                <p className="text-xs text-slate-500">Calling /api/chord…</p>
              )}
              {chord.source === "error" && (
                <p className="text-xs text-amber-700">
                  {chord.message ?? "Could not parse chord"}
                </p>
              )}
              {chord.data && (
                <div className="text-xs text-slate-600">
                  Notes: {(chord.data.noteNames ?? chord.data.pitchClasses.map((pc) => pitchClassToName(pc))).join(
                    ", ",
                  )}{" "}
                  ({chord.data.source})
                </div>
              )}
            </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Labels</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLabelMode("notes")}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    labelMode === "notes"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  Notes
                </button>
                <button
                  type="button"
                  onClick={() => setLabelMode("degrees")}
                  disabled={mode === "all"}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    mode === "all"
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                      : labelMode === "degrees"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                  title={mode === "all" ? "Select a key or analyze a chord to see degrees." : undefined}
                >
                  Degrees
                </button>
              </div>
              {labelMode === "degrees" && mode === "key" && (
                <p className="text-xs text-slate-500">
                  Showing scale degrees (1–{scale.data?.pitchClasses.length ?? 7}) for the selected scale.
                </p>
              )}
              {labelMode === "degrees" && mode === "chord" && (
                <p className="text-xs text-slate-500">Showing chord degrees relative to the chord root.</p>
              )}
            </div>

            <Legend />
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <Fretboard
            strings={tuningResult.strings}
            harmonics={harmonics}
            fretMarkers={fretMarkers}
            mode={mode}
            labelMode={labelMode}
            keySignature={
              scale.data
                ? {
                    root: scale.data.rootPitchClass,
                    scale: scale.data.pitchClasses,
                  }
                : null
            }
            keyLabel={scale.data?.label}
            chord={chord.data}
            noteNameMap={noteNameMap}
          />
        </section>
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    { color: "bg-emerald-500", label: "In key" },
    { color: "bg-blue-500", label: "Key root" },
    { color: "bg-purple-500", label: "Chord tone" },
    { color: "bg-slate-300", label: "Other harmonic" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-700">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

type FretboardProps = {
  strings: ReturnType<typeof buildTuning>["strings"];
  harmonics: EnrichedHarmonic[];
  fretMarkers: number[];
  mode: "all" | "key" | "chord";
  labelMode: "notes" | "degrees";
  keySignature?: { root: PitchClass; scale: PitchClass[] } | null;
  keyLabel?: string;
  chord?: ParsedChord | null;
  noteNameMap?: Record<string, string> | null;
};

function Fretboard({
  strings,
  harmonics,
  fretMarkers,
  mode,
  labelMode,
  keySignature,
  keyLabel,
  chord,
  noteNameMap,
}: FretboardProps) {
  const visible = useMemo(() => {
    if (mode === "chord") return harmonics.filter((h) => h.inChord);
    if (mode === "key") return harmonics.filter((h) => h.isInKey);
    return harmonics;
  }, [harmonics, mode]);

  function keyDegreeForPitchClass(pc: number): string | null {
    if (!keySignature) return null;
    const idx = keySignature.scale.findIndex((s) => s === (((pc % 12) + 12) % 12));
    if (idx < 0) return null;
    return String(idx + 1);
  }

  function chordDegreeForPitchClass(pc: number): string | null {
    if (!chord) return null;
    const rootPc = chord.root.pitchClass;
    const interval = (((pc - rootPc) % 12) + 12) % 12;
    const map: Record<number, string> = {
      0: "1",
      1: "b2",
      2: "2",
      3: "b3",
      4: "3",
      5: "4",
      6: "b5",
      7: "5",
      8: "#5",
      9: "6",
      10: "b7",
      11: "7",
    };
    return map[interval] ?? null;
  }

  function markerText(h: EnrichedHarmonic): string {
    if (labelMode === "notes") return noteNameMap?.[String(h.pitchClass)] ?? h.label;
    if (mode === "key") return keyDegreeForPitchClass(h.pitchClass) ?? h.label;
    if (mode === "chord") return chordDegreeForPitchClass(h.pitchClass) ?? h.label;
    return h.label;
  }

  function isChordRoot(pc: number): boolean {
    return !!chord && pc === chord.root.pitchClass;
  }

  const FRET_COUNT = 24;
  const BOARD_WIDTH_PX = 1200;
  const ROW_HEIGHT_PX = 44;
  const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
  const totalHeight = strings.length * ROW_HEIGHT_PX;

  function fretToXPercent(fret: number) {
    // Guitar fret spacing is logarithmic: position from nut is 1 - 2^(-f/12).
    // Normalize so fret 24 maps to 100%.
    const denom = 1 - Math.pow(2, -FRET_COUNT / 12);
    const pos = 1 - Math.pow(2, -fret / 12);
    return (pos / denom) * 100;
  }

  function pct(value: number) {
    // React server rendering may round style attribute serialization; keep our client-side
    // values deterministic to avoid hydration warnings.
    return `${value.toFixed(4)}%`;
  }

  const displayStrings = useMemo(() => [...strings].reverse(), [strings]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm text-slate-700">
        <span>
          Strings: {strings.length} {keyLabel ? `• Key: ${keyLabel}` : ""}{" "}
          {chord ? `• Chord: ${chord.label}` : ""}
        </span>
        <span className="text-xs text-slate-500">Frets 0–24</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50">
        <div className="min-w-fit">
          <div className="flex">
            <div className="sticky left-0 z-30 w-28 border-r border-slate-200 bg-white/90 backdrop-blur">
              {displayStrings.map((string, displayIdx) => {
                const stringNumber = displayIdx + 1; // guitarist diagram: 1 is highest string
                return (
                  <div
                    key={`label-${string.label}-${displayIdx}`}
                    className="flex items-center justify-end pr-3 text-xs font-semibold text-slate-700"
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    {stringNumber} ({string.label})
                  </div>
                );
              })}
            </div>

            <div
              className="relative"
              style={{
                width: `${BOARD_WIDTH_PX}px`,
                height: `${totalHeight}px`,
                background: "linear-gradient(180deg, rgba(180,83,9,0.12), rgba(2,6,23,0.02))",
              }}
            >
              {/* Frets (including nut) */}
              {fretMarkers.map((fret) => {
                const left = fretToXPercent(fret);
                const isNut = fret === 0;
                return (
                  <div key={`fret-${fret}`} className="absolute top-0 h-full" style={{ left: pct(left) }}>
                    <div className={`h-full ${isNut ? "w-[4px] bg-slate-600/70" : "w-px bg-slate-300"}`} />
                  </div>
                );
              })}

              {/* Inlay dots (single centered; double at 12/24) */}
              {INLAY_FRETS.map((fretNumber) => {
                const left = fretToXPercent(fretNumber - 0.5);
                const isDouble = fretNumber === 12 || fretNumber === 24;
                const centerY = totalHeight / 2;
                const dy = 14;
                return (
                  <div
                    key={`inlay-${fretNumber}`}
                    className="absolute"
                    style={{ left: pct(left), top: `${centerY}px` }}
                  >
                    <div className="absolute left-1/2 -translate-x-1/2">
                      {!isDouble ? (
                        <span className="block h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-slate-400/70 shadow-sm ring-1 ring-slate-500/30" />
                      ) : (
                        <>
                          <span
                            className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-slate-400/70 shadow-sm ring-1 ring-slate-500/30"
                            style={{ top: `${-dy}px` }}
                          />
                          <span
                            className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-slate-400/70 shadow-sm ring-1 ring-slate-500/30"
                            style={{ top: `${dy}px` }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* String lines */}
              {displayStrings.map((_, displayIdx) => {
                const y = displayIdx * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2;
                const thickness = Math.max(1, Math.round(1 + (displayIdx / Math.max(1, strings.length - 1)) * 2.5));
                return (
                  <div
                    key={`string-${displayIdx}`}
                    className="absolute left-0 w-full bg-slate-700/70"
                    style={{ top: `${y}px`, height: `${thickness}px`, transform: "translateY(-50%)" }}
                  />
                );
              })}

              {/* Harmonic markers */}
              {visible.map((h) => {
                const displayIdx = strings.length - 1 - h.stringIndex; // flip so low strings are on bottom
                const y = displayIdx * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2;
                const chordRoot = mode === "chord" && isChordRoot(h.pitchClass);
                const keyRoot = mode === "key" && h.isRoot;
                const isRoot = chordRoot || keyRoot;
                return (
                  <div
                    key={`${h.stringIndex}-${h.fret}-${h.label}`}
                    className="absolute"
                    style={{
                      left: pct(fretToXPercent(h.fret)),
                      top: `${y}px`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white shadow ${
                        isRoot
                          ? "bg-blue-500"
                          : h.inChord
                            ? "bg-purple-500"
                            : h.isInKey
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                      }`}
                      title={`Fret ~${h.fret.toFixed(1)} • ${h.label} • Partial ${h.partial}`}
                    >
                      {markerText(h)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fret number row */}
          <div className="flex border-t border-slate-200 bg-white/60 text-[10px] text-slate-600">
            <div className="sticky left-0 z-20 w-28 border-r border-slate-200 bg-white/90 backdrop-blur" />
            <div className="relative" style={{ width: `${BOARD_WIDTH_PX}px`, height: "26px" }}>
              {fretMarkers.map((fret) => {
                const left = fretToXPercent(fret);
                return (
                  <div key={`label-${fret}`} className="absolute" style={{ left: pct(left) }}>
                    <div className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-slate-300" />
                    <div className="absolute left-1/2 top-2 -translate-x-1/2">{fret}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
