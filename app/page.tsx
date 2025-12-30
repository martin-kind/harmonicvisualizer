"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TuningPreset, buildTuning } from "@/lib/music/tunings";
import { buildFretboardHarmonics, buildFretboardNotes, FretboardMarker } from "@/lib/music/fretboard";
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
  degreeMap?: Record<string, string>;
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
  const TUNING_STORAGE_KEY = "harmonic-finder:tuning:v1";
  const CHORD_HISTORY_KEY = "harmonic-finder:history:chords:v1";
  const SCALE_HISTORY_KEY = "harmonic-finder:history:scales:v1";
  const HISTORY_LIMIT = 12;

  const [topMode, setTopMode] = useState<"harmonics" | "notes">("harmonics");
  const [stringCount, setStringCount] = useState(6);
  const [preset, setPreset] = useState<TuningPreset>("standard");
  const [customInputs, setCustomInputs] = useState<string[]>(Array(8).fill(""));
  const [activeTab, setActiveTab] = useState<"scale" | "chord">("scale");

  const [scaleText, setScaleText] = useState("");
  const [scale, setScale] = useState<UiScale>({ data: null, source: "none" });
  const [recentScales, setRecentScales] = useState<
    { query: string; data: ParsedScale; createdAt: number }[]
  >([]);

  const [chordText, setChordText] = useState("");
  const [chord, setChord] = useState<UiChord>({ data: null, source: "none" });
  const hasAutoEnabledInKey = useRef(false);
  const [labelMode, setLabelMode] = useState<"notes" | "degrees">("notes");
  const [showOtherHarmonics, setShowOtherHarmonics] = useState(false);
  const [recentChords, setRecentChords] = useState<
    { query: string; data: ParsedChord; createdAt: number }[]
  >([]);

  // Load saved tuning on first mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TUNING_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      const obj = parsed as {
        stringCount?: unknown;
        preset?: unknown;
        customInputs?: unknown;
      };

      const nextStringCount =
        typeof obj.stringCount === "number" && Number.isFinite(obj.stringCount)
          ? Math.min(8, Math.max(4, Math.round(obj.stringCount)))
          : null;

      const nextPreset =
        obj.preset === "standard" || obj.preset === "fourths" || obj.preset === "custom"
          ? (obj.preset as TuningPreset)
          : null;

      const nextCustomInputs = Array.isArray(obj.customInputs)
        ? obj.customInputs.map((v) => (typeof v === "string" ? v : "")).slice(0, 8)
        : null;

      if (nextStringCount !== null) setStringCount(nextStringCount);
      if (nextPreset !== null) setPreset(nextPreset);
      if (nextCustomInputs !== null) {
        setCustomInputs((prev) => {
          const base = [...prev];
          for (let i = 0; i < 8; i += 1) base[i] = nextCustomInputs[i] ?? "";
          return base;
        });
      }
    } catch {
      // ignore corrupted localStorage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load cached history on first mount
  useEffect(() => {
    try {
      const rawChords = window.localStorage.getItem(CHORD_HISTORY_KEY);
      if (rawChords) {
        const parsed = JSON.parse(rawChords);
        if (Array.isArray(parsed)) setRecentChords(parsed);
      }
    } catch {
      // ignore
    }
    try {
      const rawScales = window.localStorage.getItem(SCALE_HISTORY_KEY);
      if (rawScales) {
        const parsed = JSON.parse(rawScales);
        if (Array.isArray(parsed)) setRecentScales(parsed);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist tuning whenever it changes
  useEffect(() => {
    try {
      window.localStorage.setItem(
        TUNING_STORAGE_KEY,
        JSON.stringify({
          stringCount,
          preset,
          customInputs,
        }),
      );
    } catch {
      // ignore quota/security errors
    }
  }, [TUNING_STORAGE_KEY, customInputs, preset, stringCount]);

  // Persist history whenever it changes
  useEffect(() => {
    try {
      window.localStorage.setItem(CHORD_HISTORY_KEY, JSON.stringify(recentChords));
    } catch {
      // ignore
    }
  }, [CHORD_HISTORY_KEY, recentChords]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SCALE_HISTORY_KEY, JSON.stringify(recentScales));
    } catch {
      // ignore
    }
  }, [SCALE_HISTORY_KEY, recentScales]);

  function upsertChordHistory(query: string, data: ParsedChord) {
    const now = Date.now();
    setRecentChords((prev) => {
      const filtered = prev.filter((x) => x.query !== query);
      return [{ query, data, createdAt: now }, ...filtered].slice(0, HISTORY_LIMIT);
    });
  }

  function upsertScaleHistory(query: string, data: ParsedScale) {
    const now = Date.now();
    setRecentScales((prev) => {
      const filtered = prev.filter((x) => x.query !== query);
      return [{ query, data, createdAt: now }, ...filtered].slice(0, HISTORY_LIMIT);
    });
  }

  function getCachedChord(query: string): ParsedChord | null {
    const hit = recentChords.find((x) => x.query === query);
    return hit?.data ?? null;
  }

  function getCachedScale(query: string): ParsedScale | null {
    const hit = recentScales.find((x) => x.query === query);
    return hit?.data ?? null;
  }

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

  const markers: FretboardMarker[] = useMemo(() => {
    const keySig =
      activeTab === "scale" && scale.data
        ? {
            root: scale.data.rootPitchClass,
            scale: scale.data.pitchClasses,
          }
        : null;
    const chordSig = activeTab === "chord" ? chord.data : null;

    return topMode === "notes"
      ? buildFretboardNotes({ tuning: tuningResult.strings, key: keySig, chord: chordSig, fretCount: 24 })
      : buildFretboardHarmonics({ tuning: tuningResult.strings, key: keySig, chord: chordSig });
  }, [tuningResult.strings, activeTab, chord.data, scale.data, topMode]);

  const fretMarkers = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);

  async function analyzeChord() {
    const trimmed = chordText.trim();
    if (!trimmed) {
      setChord({ data: null, source: "none" });
      return;
    }
    const cached = getCachedChord(trimmed);
    if (cached) {
      setScale({ data: null, source: "none" });
      setScaleText("");
      setChord({ data: cached, source: "success" });
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
      upsertChordHistory(trimmed, data);
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
    const cached = getCachedScale(trimmed);
    if (cached) {
      setChord({ data: null, source: "none" });
      setChordText("");
      setScale({ data: cached, source: "success" });
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
      upsertScaleHistory(trimmed, data);
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
      <div className="px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTopMode("harmonics")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                topMode === "harmonics"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              Harmonics
            </button>
            <button
              type="button"
              onClick={() => setTopMode("notes")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                topMode === "notes"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              Fretted Notes
            </button>
          </div>

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
                {tuningResult.strings.map((s, idx) => {
                  const stringNumber = tuningResult.strings.length - idx; // low string gets highest number
                  return (
                    <span key={`${s.label}-${idx}`} className="rounded bg-slate-100 px-2 py-1">
                      {stringNumber}: {s.label}
                    </span>
                  );
                })}
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
              <button
                type="button"
                onClick={() => {
                  setScale({ data: null, source: "none" });
                  setScaleText("");
                  setChord({ data: null, source: "none" });
                  setChordText("");
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title="Clear scale and chord to show all harmonics"
              >
                Show all
              </button>
            </div>

            {activeTab === "scale" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Scale / Key</p>
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

                {recentScales.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-600">Recent scales</div>
                    <div className="flex flex-wrap gap-2">
                      {recentScales.slice(0, 8).map((item) => (
                        <button
                          key={`scale-${item.query}-${item.createdAt}`}
                          type="button"
                          onClick={() => {
                            setScaleText(item.query);
                            setChord({ data: null, source: "none" });
                            setChordText("");
                            setScale({ data: item.data, source: "success" });
                          }}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                          title={item.data.label}
                        >
                          {item.query}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {scale.source === "loading" && <p className="text-xs text-slate-500">Calling /api/scale…</p>}
                {scale.source === "error" && (
                  <p className="text-xs text-amber-700">{scale.message ?? "Could not parse scale"}</p>
                )}
                {scale.data && (
                  <div className="text-xs text-slate-600">
                    {scale.data.label}: {scale.data.noteNames.join(", ")}
                  </div>
                )}
              </div>
            )}

            {activeTab === "chord" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Chord</p>
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

              {recentChords.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-slate-600">Recent chords</div>
                  <div className="flex flex-wrap gap-2">
                    {recentChords.slice(0, 8).map((item) => (
                      <button
                        key={`chord-${item.query}-${item.createdAt}`}
                        type="button"
                        onClick={() => {
                          setChordText(item.query);
                          setScale({ data: null, source: "none" });
                          setScaleText("");
                          setChord({ data: item.data, source: "success" });
                        }}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        title={item.data.label}
                      >
                        {item.query}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                  )}
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

            {mode !== "all" && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showOtherHarmonics}
                  onChange={(e) => setShowOtherHarmonics(e.target.checked)}
                />
                {mode === "key"
                  ? "Show non-scale/key harmonics"
                  : "Show non-chord-tone harmonics"}
              </label>
            )}

            <Legend />
            </div>
          </section>
        </div>

        {/* Full-width fretboard (not constrained by the max-w-6xl controls container) */}
        <section className="mt-8 rounded-xl bg-white p-4 shadow-sm">
          <Fretboard
            strings={tuningResult.strings}
            markers={markers}
            fretMarkers={fretMarkers}
            mode={mode}
            labelMode={labelMode}
            showOtherHarmonics={showOtherHarmonics}
            markerLayout={topMode}
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
            scaleDegreeMap={scale.data?.degreeMap ?? null}
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
  markers: FretboardMarker[];
  fretMarkers: number[];
  mode: "all" | "key" | "chord";
  labelMode: "notes" | "degrees";
  showOtherHarmonics: boolean;
  markerLayout: "harmonics" | "notes";
  keySignature?: { root: PitchClass; scale: PitchClass[] } | null;
  keyLabel?: string;
  chord?: ParsedChord | null;
  noteNameMap?: Record<string, string> | null;
  scaleDegreeMap?: Record<string, string> | null;
};

function Fretboard({
  strings,
  markers,
  fretMarkers,
  mode,
  labelMode,
  showOtherHarmonics,
  markerLayout,
  keySignature,
  keyLabel,
  chord,
  noteNameMap,
  scaleDegreeMap,
}: FretboardProps) {
  const visible = useMemo(() => {
    if (showOtherHarmonics) return markers;
    if (mode === "chord") return markers.filter((h) => h.inChord);
    if (mode === "key") return markers.filter((h) => h.isInKey);
    return markers;
  }, [markers, mode, showOtherHarmonics]);

  const visibleBoardMarkers = useMemo(() => {
    if (markerLayout !== "notes") return visible;
    // Open strings (fret 0) are rendered in the sticky label gutter instead.
    return visible.filter((m) => m.fret !== 0);
  }, [markerLayout, visible]);

  const openStringMarkersByStringIndex = useMemo(() => {
    if (markerLayout !== "notes") return new Map<number, FretboardMarker>();
    const map = new Map<number, FretboardMarker>();
    for (const m of visible) {
      if (m.fret === 0) map.set(m.stringIndex, m);
    }
    return map;
  }, [markerLayout, visible]);

  function keyDegreeForPitchClass(pc: number): string | null {
    if (scaleDegreeMap?.[String(pc)] !== undefined) return scaleDegreeMap[String(pc)];
    if (!keySignature) return null;
    const idx = keySignature.scale.findIndex((s) => s === (((pc % 12) + 12) % 12));
    if (idx < 0) return null;
    return String(idx + 1);
  }

  function chordDegreeForPitchClass(pc: number): string | null {
    if (!chord) return null;
    if (chord.degreeMap?.[String(pc)] !== undefined) return chord.degreeMap[String(pc)];
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

  function markerText(h: FretboardMarker): string {
    if (labelMode === "notes") return noteNameMap?.[String(h.pitchClass)] ?? h.label;
    if (mode === "key") return keyDegreeForPitchClass(h.pitchClass) ?? h.label;
    if (mode === "chord") return chordDegreeForPitchClass(h.pitchClass) ?? h.label;
    return h.label;
  }

  function isChordRoot(pc: number): boolean {
    return !!chord && pc === chord.root.pitchClass;
  }

  function markerColor(h: FretboardMarker): string {
    const chordRoot = mode === "chord" && isChordRoot(h.pitchClass);
    const keyRoot = mode === "key" && h.isRoot;
    const isRoot = chordRoot || keyRoot;
    return isRoot
      ? "bg-blue-500"
      : h.inChord
        ? "bg-purple-500"
        : h.isInKey
          ? "bg-emerald-500"
          : "bg-slate-300";
  }

  const FRET_COUNT = 24;
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

  function markerXPercent(fret: number) {
    if (markerLayout !== "notes") return fretToXPercent(fret);
    // Fretted note "fret N" belongs to the space between fret (N-1) and fret N.
    // Example: F on the low E string is fret 1 (between nut=0 and fret 1), not fret 2.
    if (fret <= 0) return fretToXPercent(0);
    const left = fretToXPercent(fret - 1);
    const right = fretToXPercent(fret);
    return (left + right) / 2;
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
        <div className="w-full">
          <div className="flex">
            <div className="sticky left-0 z-30 w-20 border-r border-slate-200 bg-white/90 backdrop-blur">
              {displayStrings.map((string, displayIdx) => {
                const stringNumber = displayIdx + 1; // guitarist diagram: 1 is highest string
                const originalStringIndex = strings.length - 1 - displayIdx;
                const openMarker = openStringMarkersByStringIndex.get(originalStringIndex);
                return (
                  <div
                    key={`label-${string.label}-${displayIdx}`}
                    className="flex items-center justify-end pr-2 text-xs font-semibold text-slate-700"
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    {markerLayout === "notes" && openMarker && (
                      <span
                        className={`relative z-50 mr-2 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white shadow ${markerColor(
                          openMarker,
                        )}`}
                        title={`Open • ${openMarker.label}`}
                      >
                        {markerText(openMarker)}
                      </span>
                    )}
                    <span className="whitespace-nowrap">{stringNumber} {string.label}</span>
                  </div>
                );
              })}
            </div>

            <div
              className="relative w-full min-w-[1100px]"
              style={{
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
              {visibleBoardMarkers.map((h) => {
                const displayIdx = strings.length - 1 - h.stringIndex; // flip so low strings are on bottom
                const y = displayIdx * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2;
                const compactHighFrets = markerLayout === "notes" && h.fret > 18;
                return (
                  <div
                    key={`${h.stringIndex}-${h.fret}-${h.label}`}
                    className="absolute"
                    style={{
                      left: pct(markerXPercent(h.fret)),
                      top: `${y}px`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <span
                      className={`flex items-center justify-center font-semibold text-white shadow ${
                        compactHighFrets ? "h-7 w-6 rounded-full text-[10px]" : "h-8 w-8 rounded-full text-[11px]"
                      } ${markerColor(
                        h,
                      )}`}
                      title={
                        markerLayout === "notes"
                          ? `Fret ${h.fret} • ${h.label}`
                          : `Fret ~${h.fret.toFixed(1)} • ${h.label} • Partial ${h.partial ?? "?"}`
                      }
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
            <div className="sticky left-0 z-20 w-20 border-r border-slate-200 bg-white/90 backdrop-blur" />
            <div className="relative w-full min-w-[1100px]" style={{ height: "26px" }}>
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
