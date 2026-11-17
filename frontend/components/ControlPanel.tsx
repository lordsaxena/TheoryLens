"use client";

import { SlidersHorizontal } from "lucide-react";
import type { ParseResponse, Theory } from "@/lib/types";
import type { ParamValues } from "@/lib/physics";
import TelemetryCard from "./TelemetryCard";

interface Props {
  theory: Theory | null;
  values: ParamValues;
  onChange: (id: string, value: number) => void;
  meta: Pick<ParseResponse, "source" | "model" | "extracted_text"> | null;
}

const decimals = (step: number) => (step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step))));

export default function ControlPanel({ theory, values, onChange, meta }: Props) {
  return (
    <div className="flex flex-col gap-5 p-5">
      {!theory && (
        <p className="rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-500">
          Parameters, equations and the explanation appear here once a theory is visualized.
        </p>
      )}

      {theory && (
        <>
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <SlidersHorizontal size={14} /> Live parameters
            </div>
            <div className="space-y-4">
              {theory.parameters.map((p) => {
                const v = values[p.id] ?? p.default;
                return (
                  <div key={p.id}>
                    <div className="mb-1 flex justify-between text-xs">
                      <label htmlFor={`p-${p.id}`} className="text-slate-300">
                        {p.label}
                      </label>
                      <span className="font-mono text-[#76b900]">
                        {v.toFixed(decimals(p.step))} {p.unit}
                      </span>
                    </div>
                    <input
                      id={`p-${p.id}`}
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={v}
                      onChange={(e) => onChange(p.id, Number(e.target.value))}
                      className="w-full accent-[#76b900]"
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Equations</div>
            <ul className="space-y-1.5">
              {theory.equations.map((eq, i) => (
                <li
                  key={i}
                  className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200"
                >
                  {eq}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Explanation</div>
            <p className="text-sm leading-relaxed text-slate-300">{theory.summary}</p>
            {meta?.extracted_text && (
              <p className="mt-2 rounded-md bg-slate-900 p-2 text-[11px] text-slate-400">
                Extracted from image: {meta.extracted_text}
              </p>
            )}
          </section>
        </>
      )}

      <TelemetryCard meta={meta} />
    </div>
  );
}