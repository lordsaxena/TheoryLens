"use client";

import { useState } from "react";
import SceneCanvas from "@/components/SceneCanvas";
import TheoryInput from "@/components/TheoryInput";
import ControlPanel from "@/components/ControlPanel";
import { parseImage, parseTheory } from "@/lib/api";
import { defaultValues, type ParamValues } from "@/lib/physics";
import type { ParseResponse, Theory } from "@/lib/types";

type Meta = Pick<ParseResponse, "source" | "model" | "extracted_text">;

export default function Home() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [theory, setTheory] = useState<Theory | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [values, setValues] = useState<ParamValues>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [resetNonce, setResetNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const apply = (res: ParseResponse) => {
    setTheory(res.theory);
    setValues(defaultValues(res.theory));
    setMeta({ source: res.source, model: res.model, extracted_text: res.extracted_text });
    setSelectedId(null);
    setPlaying(true);
    setResetNonce((n) => n + 1);
  };

  const run = async (prompt: string, image: File | null) => {
    setLoading(true);
    setError(null);
    try {
      apply(image ? await parseImage(image, prompt) : await parseTheory(prompt));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
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
          onPreset={(prompt) => {
            setText(prompt);
            setFile(null);
            void run(prompt, null);
          }}
        />
      </aside>

      <section className="relative min-w-0">
        <SceneCanvas
          theory={theory}
          values={values}
          playing={playing}
          onTogglePlay={() => setPlaying((p) => !p)}
          resetNonce={resetNonce}
          onReset={() => setResetNonce((n) => n + 1)}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </section>

      <aside className="overflow-y-auto border-l border-slate-800">
        <ControlPanel
          theory={theory}
          values={values}
          onChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
          meta={meta}
        />
      </aside>
    </main>
  );
}