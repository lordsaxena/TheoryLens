"use client";

import { useRef, useState } from "react";
import { Activity, Atom, FileImage, Loader2, Orbit, Sparkles, Upload, Waves, X } from "lucide-react";
import { PRESETS } from "@/lib/presets";

const ICONS = { oscillator: Activity, orbit: Orbit, wave: Waves } as const;

interface Props {
  value: string;
  onChange: (v: string) => void;
  file: File | null;
  onFile: (f: File | null) => void;
  onVisualize: () => void;
  onPreset: (prompt: string) => void;
  loading: boolean;
  error: string | null;
}

export default function TheoryInput({ value, onChange, file, onFile, onVisualize, onPreset, loading, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (f: File | undefined) => {
    if (f && f.type.startsWith("image/")) onFile(f);
  };

  const canSubmit = !loading && (value.trim().length > 0 || file !== null);

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-[#76b900]/15 p-2 text-[#76b900]">
          <Atom size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight text-slate-100">TheoryLens</h1>
          <p className="text-[11px] text-slate-400">Theory → interactive 3D simulation</p>
        </div>
      </div>

      <section>
        <label htmlFor="theory" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Scientific concept or equation
        </label>
        <textarea
          id="theory"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder="e.g. m x'' + b x' + k x = 0, or describe a theory in words…"
          className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-[#76b900] focus:outline-none"
        />
      </section>

      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">One-click presets</div>
        <div className="flex flex-col gap-2">
          {PRESETS.map((p) => {
            const Icon = ICONS[p.id];
            return (
              <button
                key={p.id}
                type="button"
                disabled={loading}
                onClick={() => onPreset(p.prompt)}
                className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-[#76b900]/60 hover:text-[#76b900] disabled:opacity-50"
              >
                <Icon size={16} className="text-[#76b900]" />
                {p.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Textbook / notes image</div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-5 text-center text-xs transition ${
            dragging ? "border-[#76b900] bg-[#76b900]/10" : "border-slate-700 hover:border-[#76b900]/60"
          }`}
        >
          {file ? (
            <>
              <FileImage size={22} className="text-[#76b900]" />
              <span className="max-w-full truncate text-slate-200">{file.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFile(null);
                }}
                className="flex items-center gap-1 text-slate-400 hover:text-red-400"
              >
                <X size={12} /> Remove
              </button>
            </>
          ) : (
            <>
              <Upload size={22} className="text-slate-500" />
              <span className="text-slate-400">Drop a screenshot here or click to browse</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => accept(e.target.files?.[0])}
          />
        </div>
      </section>

      {error && <p className="rounded-lg border border-red-900 bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}

      <button
        type="button"
        onClick={onVisualize}
        disabled={!canSubmit}
        className="flex items-center justify-center gap-2 rounded-lg bg-[#76b900] px-4 py-3 text-sm font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {loading ? "Nemotron is thinking…" : "Visualize Theory"}
      </button>
    </div>
  );
}