"use client";

import { useEffect, useState } from "react";
import { Cpu, Loader2, RefreshCw, Zap } from "lucide-react";
import { runBenchmark } from "@/lib/api";
import type { BenchmarkResult, ParseResponse } from "@/lib/types";

interface Props {
  meta: Pick<ParseResponse, "source" | "model"> | null;
}

export default function TelemetryCard({ meta }: Props) {
  const [bench, setBench] = useState<BenchmarkResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    runBenchmark()
      .then((r) => alive && setBench(r))
      .catch((e: unknown) => alive && setErr(e instanceof Error ? e.message : "Benchmark failed"))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, []);

  const rerun = () => {
    setBusy(true);
    setErr(null);
    runBenchmark()
      .then(setBench)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Benchmark failed"))
      .finally(() => setBusy(false));
  };

  const cpuPct = 100;
  const gpuPct = bench ? Math.max(3, Math.min(100, (bench.gpu_ms / bench.cpu_ms) * 100)) : 0;

  return (
    <div className="rounded-xl border border-[#76b900]/30 bg-gradient-to-b from-[#76b900]/10 to-transparent p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#76b900]">
          <Cpu size={16} /> NVIDIA NIM &amp; GPU Telemetry
        </div>
        <button
          type="button"
          onClick={rerun}
          disabled={busy}
          aria-label="Re-run benchmark"
          className="text-slate-400 hover:text-[#76b900] disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      <div className="mb-3 space-y-1 text-[11px] text-slate-300">
        <div className="flex justify-between">
          <span className="text-slate-500">Reasoning</span>
          <span className="font-mono">nemotron-super-49b-v1</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Vision</span>
          <span className="font-mono">nemotron-nano-12b-v2-vl</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Last parse</span>
          <span className={meta?.source === "nvidia-nim" ? "text-[#76b900]" : "text-amber-400"}>
            {meta ? (meta.source === "nvidia-nim" ? "Live NIM" : "Offline preset") : "—"}
          </span>
        </div>
      </div>

      {err && <p className="text-xs text-red-400">Backend unreachable: {err}</p>}

      {bench && (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div className="flex items-center gap-1 text-3xl font-bold text-slate-100">
              <Zap size={22} className="text-[#76b900]" />
              {bench.speedup_factor.toFixed(1)}×
            </div>
            <div className="text-right text-[11px] text-slate-400">
              {bench.gpu_available ? "CUDA speedup" : "CUDA unavailable, CPU fallback"}
              <div className="font-mono text-slate-500">{bench.device}</div>
            </div>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div>
              <div className="mb-0.5 flex justify-between text-slate-400">
                <span>{bench.backend === "cupy-cuda" ? "GPU (CuPy)" : "NumPy"}</span>
                <span className="font-mono">{bench.gpu_ms.toFixed(1)} ms</span>
              </div>
              <div className="h-1.5 rounded bg-slate-800">
                <div className="h-full rounded bg-[#76b900]" style={{ width: `${gpuPct}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-0.5 flex justify-between text-slate-400">
                <span>CPU (NumPy)</span>
                <span className="font-mono">{bench.cpu_ms.toFixed(1)} ms</span>
              </div>
              <div className="h-1.5 rounded bg-slate-800">
                <div className="h-full rounded bg-slate-500" style={{ width: `${cpuPct}%` }} />
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500">
            {bench.grid_size}×{bench.grid_size} wave grid · {bench.steps} steps
          </div>
        </div>
      )}
    </div>
  );
}