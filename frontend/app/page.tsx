"use client";

import { useMemo, useState } from "react";
import SceneCanvas from "@/components/SceneCanvas";
import TheoryInput from "@/components/TheoryInput";
import ControlPanel from "@/components/ControlPanel";
import { parseImage, parseTheory } from "@/lib/api";
import { PRESETS } from "@/lib/presets";
import presetData from "@/lib/presets.json";
import { buildRuntime, defaultValues, type ParamValues } from "@/lib/runtime";
import type { ParseResponse, Theory } from "@/lib/types";

const LOCAL = presetData as unknown as Record<string, Theory>;
type Meta = Pick<ParseResponse, "source" | "model" | "extracted_text">;

function pickLocal(text: string): string {
  const t = text.toLowerCase();
  if (/orbit|gravit|kepler|newton|planet|celestial/.test(t)) return "orbit";
  if (/wave|interfer|diffract|slit|superposition|ripple/.test(t)) return "wave";
  if (/electric|charge|dipole|coulomb|field line|magnet/.test(t)) return "dipole";
  return "oscillator";
}

export default function Home() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [theory, setTheory] = useState<Theory>(LOCAL.wave);
  const [values, setValues] = useState<ParamValues>(() => defaultValues(LOCAL.wave));
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [resetNonce, setResetNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rt = useMemo(() => buildRuntime(theory), [theory]);

  const apply = (res: ParseResponse, note: string | null) => {
    setTheory(res.theory);
    setValues(defaultValues(res.theory));
    setMeta({ source: res.source, model: res.model, extracted_text: res.extracted_text });
    setNotice(note);
    setSelectedId(null);
    setPlaying(true);
    setResetNonce((n) => n + 1);
  };

  const run = async (prompt: string, image: File | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = image ? await parseImage(image, prompt) : await parseTheory(prompt);
      apply(res, res.source === "fallback-preset"
        ? "No live NVIDIA model answered, so this is the closest built-in preset. Set NVIDIA_API_KEY in backend/.env to simulate any topic."
        : null);
    } catch {
      apply(
        { theory: LOCAL[pickLocal(prompt)], source: "fallback-preset", model: null, extracted_text: null },
        "Backend unreachable. Is uvicorn running on port 8000? Showing a built-in preset.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid h-screen grid-cols-[320px_minmax(0,1fr)_360px] bg-slate-950 text-slate-100">
      <aside className="overflow-y-auto border-r border-slate-800">
        <TheoryInput
          value={text}
          onChange={setText}
          file={file}
          onFile={setFile}
          loading={loading}
          error={error}
          onVisualize={() => void run(text, file)}
          onPreset={(id) => {
            const p = PRESETS.find((x) => x.id === id);
            setText(p?.prompt ?? "");
            setFile(null);
            apply({ theory: LOCAL[id], source: "fallback-preset", model: null, extracted_text: null }, null);
          }}
        />
      </aside>

      <section className="relative min-w-0">
        <SceneCanvas
          theory={theory}
          rt={rt}
          values={values}
          playing={playing}
          onTogglePlay={() => setPlaying((p) => !p)}
          resetNonce={resetNonce}
          onReset={() => setResetNonce((n) => n + 1)}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {notice && (
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="absolute right-4 top-4 max-w-xs rounded-lg border border-amber-500/40 bg-amber-950/70 p-3 text-left text-xs text-amber-200 backdrop-blur"
          >
            {notice}
          </button>
        )}
      </section>

      <aside className="overflow-y-auto border-l border-slate-800">
        <ControlPanel
          theory={theory}
          values={values}
          onChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
          meta={meta}
          errors={rt.errors}
        />
      </aside>
    </main>
  );
}
