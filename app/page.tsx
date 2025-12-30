"use client";

import { useMemo, useState } from "react";
import { ALL_KEYS, KeySignature } from "@/lib/music/keys";
import { TuningPreset, buildTuning } from "@/lib/music/tunings";
import { buildFretboardHarmonics, EnrichedHarmonic } from "@/lib/music/fretboard";
import { HARMONIC_FRETS } from "@/lib/music/harmonics";
import { ParsedChord, parseChordLocally } from "@/lib/music/chords";
import { pitchClassToName } from "@/lib/music/notes";

type UiChord = {
  data: ParsedChord | null;
  source: "none" | "loading" | "error" | "success";
  message?: string;
};

const tuningPresetOptions: { id: TuningPreset; label: string; description: string }[] = [
  { id: "standard", label: "Standard", description: "EADGBE (extended for 7/8)" },
  { id: "fourths", label: "All fourths", description: "EADGCF..." },
  { id: "custom", label: "Custom", description: "Enter note per string" },
];

const keyOptions = ALL_KEYS.map((k) => ({ value: k.label, key: k }));

export default function Home() {
  const [stringCount, setStringCount] = useState(6);
  const [preset, setPreset] = useState<TuningPreset>("standard");
  const [customInputs, setCustomInputs] = useState<string[]>(Array(8).fill(""));
  const [selectedKeyLabel, setSelectedKeyLabel] = useState<string | null>("C major");
  const [showOnlyKey, setShowOnlyKey] = useState(false);
  const [chordText, setChordText] = useState("");
  const [chord, setChord] = useState<UiChord>({ data: null, source: "none" });

  const selectedKey: KeySignature | null = useMemo(() => {
    if (!selectedKeyLabel) return null;
    return ALL_KEYS.find((k) => k.label === selectedKeyLabel) ?? null;
  }, [selectedKeyLabel]);

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
      key: selectedKey,
      chord: chord.data,
    });
  }, [tuningResult.strings, selectedKey, chord.data]);

  const fretMarkers = useMemo(() => [...new Set([...HARMONIC_FRETS, 0, 24])].sort((a, b) => a - b), []);

  async function analyzeChord() {
    const trimmed = chordText.trim();
    if (!trimmed) {
      setChord({ data: null, source: "none" });
      return;
    }
    const local = parseChordLocally(trimmed);
    setChord({ data: local, source: "loading" });
    try {
      const res = await fetch("/api/chord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chord: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json();
        setChord({
          data: local,
          source: "error",
          message: body?.error ?? "Could not parse chord",
        });
        return;
      }
      const data = (await res.json()) as ParsedChord;
      setChord({ data, source: "success" });
    } catch (error) {
      console.error(error);
      setChord({ data: local, source: "error", message: "Network or LLM error" });
    }
  }

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
                <p className="text-xs text-slate-500">
                  Accepts note names like C, Eb, F#, or with octave C3.
                </p>
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
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Key (major / minor)
              <select
                value={selectedKeyLabel ?? ""}
                onChange={(e) => setSelectedKeyLabel(e.target.value || null)}
                className="rounded border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {keyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showOnlyKey}
                onChange={(e) => setShowOnlyKey(e.target.checked)}
              />
              Show only in-key (chord tones always show)
            </label>

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
                  {chord.message ?? "Could not parse chord; showing local guess if available."}
                </p>
              )}
              {chord.data && (
                <div className="text-xs text-slate-600">
                  Notes: {chord.data.pitchClasses.map((pc) => pitchClassToName(pc)).join(", ")} (
                  {chord.data.source})
                </div>
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
            showOnlyKey={showOnlyKey}
            keyLabel={selectedKey?.label}
            chord={chord.data}
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
  showOnlyKey: boolean;
  keyLabel?: string;
  chord?: ParsedChord | null;
};

function Fretboard({
  strings,
  harmonics,
  fretMarkers,
  showOnlyKey,
  keyLabel,
  chord,
}: FretboardProps) {
  const visible = useMemo(() => {
    if (!showOnlyKey) return harmonics;
    return harmonics.filter((h) => h.isInKey || h.inChord);
  }, [harmonics, showOnlyKey]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm text-slate-700">
        <span>
          Strings: {strings.length} {keyLabel ? `• Key: ${keyLabel}` : ""}{" "}
          {chord ? `• Chord: ${chord.label}` : ""}
        </span>
        <span className="text-xs text-slate-500">Frets 0–24</span>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <div className="absolute inset-0 px-10">
          {strings.map((string, idx) => (
            <div
              key={string.label + idx}
              className="relative h-16 border-b border-slate-200 last:border-b-0"
            >
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-slate-300" />
              <span className="absolute left-0 top-2 ml-[-2.5rem] text-xs font-semibold text-slate-600">
                {idx + 1} ({string.label})
              </span>
              {visible
                .filter((h) => h.stringIndex === idx)
                .map((h) => (
                  <div
                    key={`${h.stringIndex}-${h.fret}-${h.label}`}
                    className="absolute top-1/2 -translate-y-1/2"
                    style={{ left: `${(h.fret / 24) * 100}%` }}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white shadow ${
                        h.inChord
                          ? "bg-purple-500"
                          : h.isRoot
                            ? "bg-blue-500"
                            : h.isInKey
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                      }`}
                      title={`Fret ~${h.fret.toFixed(1)} • ${h.label} • Partial ${h.partial}`}
                    >
                      {h.label}
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>

        <div className="relative z-10 h-10 px-10 text-[10px] text-slate-500">
          {fretMarkers.map((fret) => {
            const left = (fret / 24) * 100;
            return (
              <div key={fret} className="absolute" style={{ left: `${left}%` }}>
                <div className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-slate-300" />
                <div className="absolute left-1/2 top-3 -translate-x-1/2">{fret}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
