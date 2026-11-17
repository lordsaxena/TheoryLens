import type { BenchmarkResult, ParseResponse } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Backend error ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  return (await res.json()) as T;
}

export async function parseTheory(text: string): Promise<ParseResponse> {
  const res = await fetch(`${API}/api/parse-theory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return handle<ParseResponse>(res);
}

export async function parseImage(file: File, context: string): Promise<ParseResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("context", context);
  const res = await fetch(`${API}/api/parse-image`, { method: "POST", body: form });
  return handle<ParseResponse>(res);
}

export async function runBenchmark(): Promise<BenchmarkResult> {
  const res = await fetch(`${API}/api/benchmark`);
  return handle<BenchmarkResult>(res);
}
