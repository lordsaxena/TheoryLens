import type { SceneObject, Theory, Vec3 } from "./types";

export type ParamValues = Record<string, number>;

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

/** First parameter id with a finite value, else the fallback. */
export function pv(values: ParamValues, ids: string[], fallback: number): number {
  for (const id of ids) {
    const v = values[id];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return fallback;
}

export function defaultValues(theory: Theory): ParamValues {
  const out: ParamValues = {};
  for (const p of theory.parameters) out[p.id] = p.default;
  return out;
}

export const hasParam = (theory: Theory, id: string) => theory.parameters.some((p) => p.id === id);
export const isStatic = (id: string) => /anchor|wall|support|fixed|ceiling/i.test(id);

function solveKepler(meanAnomaly: number, e: number): number {
  const m = ((meanAnomaly % TAU) + TAU) % TAU;
  let big = e > 0.8 ? Math.PI : m;
  for (let i = 0; i < 8; i++) {
    big -= (big - e * Math.sin(big) - m) / (1 - e * Math.cos(big));
  }
  return big;
}

/** Position relative to the focus of a Kepler ellipse in the x-z plane. */
function orbitOffset(t: number, a: number, e: number, mu: number, phase: number): Vec3 {
  const n = Math.sqrt(mu / (a * a * a));
  const big = solveKepler(n * t + phase, e);
  return [a * (Math.cos(big) - e), 0, a * Math.sqrt(1 - e * e) * Math.sin(big)];
}

/** Exact displacement of a damped oscillator released from rest at x = A. */
export function dampedDisplacement(t: number, m: number, k: number, b: number, amp: number): number {
  const mass = Math.max(m, 1e-3);
  const gamma = b / (2 * mass);
  const w0sq = k / mass;
  const disc = gamma * gamma - w0sq;
  if (Math.abs(disc) < 1e-6) return amp * (1 + gamma * t) * Math.exp(-gamma * t);
  if (disc < 0) {
    const wd = Math.sqrt(-disc);
    return amp * Math.exp(-gamma * t) * (Math.cos(wd * t) + (gamma / wd) * Math.sin(wd * t));
  }
  const s = Math.sqrt(disc);
  const r1 = gamma - s;
  const r2 = gamma + s;
  return (amp * (r2 * Math.exp(-r1 * t) - r1 * Math.exp(-r2 * t))) / (r2 - r1);
}

/** Gravity-like field pointing at the source, softened near the centre. */
export function fieldAt(p: Vec3, c: Vec3, strength: number): { dir: Vec3; mag: number } {
  const dx = c[0] - p[0];
  const dy = c[1] - p[1];
  const dz = c[2] - p[2];
  const r = Math.hypot(dx, dy, dz) || 1e-6;
  return { dir: [dx / r, dy / r, dz / r], mag: strength / (r * r + 0.5) };
}

function orbitPositions(objs: SceneObject[], values: ParamValues, t: number, out: Record<string, Vec3>) {
  const center = objs[0];
  if (!center) return;
  const c = center.initial_position;
  out[center.id] = copy(c);
  const mass = Math.max(pv(values, ["central_mass", "mass", "source_strength", "M"], 10), 0.01);
  const a0 = Math.max(pv(values, ["orbit_radius", "radius", "a"], 5), 0.5);
  const e = clamp(pv(values, ["eccentricity", "e"], 0), 0, 0.9);
  const ts = pv(values, ["time_scale", "speed"], 1);
  objs.slice(1).forEach((o, i) => {
    const off = orbitOffset(t, a0 * (1 + 0.35 * i), e, mass * ts * ts, i * 2.1);
    out[o.id] = [c[0] + off[0], c[1] + off[1], c[2] + off[2]];
  });
}

/** Single source of truth for where every object is at time t. */
export function computeObjectPositions(theory: Theory, values: ParamValues, t: number): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  const objs = theory.objects;

  if (theory.simulation_type === "wave_field") {
    const sep = pv(values, ["separation", "source_separation", "d"], 5);
    objs.forEach((o, i) => {
      out[o.id] =
        objs.length === 2
          ? [(i === 0 ? -1 : 1) * (sep / 2), o.initial_position[1], o.initial_position[2]]
          : copy(o.initial_position);
    });
    return out;
  }

  if (theory.simulation_type === "vector_field" || hasParam(theory, "orbit_radius")) {
    orbitPositions(objs, values, t, out);
    return out;
  }

  if (hasParam(theory, "stiffness")) {
    const x = dampedDisplacement(
      t,
      pv(values, ["mass", "m"], 1),
      pv(values, ["stiffness", "spring_constant", "k"], 12),
      pv(values, ["damping", "damping_coefficient", "b"], 0.5),
      pv(values, ["amplitude", "initial_displacement", "A"], 2),
    );
    for (const o of objs) {
      const p = o.initial_position;
      out[o.id] = isStatic(o.id) ? copy(p) : [p[0] + x, p[1], p[2]];
    }
    return out;
  }

  // Generic fallback: free bodies circle the origin.
  const speed = pv(values, ["angular_velocity", "omega", "speed"], 1);
  for (const o of objs) {
    const p = o.initial_position;
    if (isStatic(o.id)) {
      out[o.id] = copy(p);
      continue;
    }
    const r = Math.hypot(p[0], p[2]) || 2;
    const a0 = Math.atan2(p[2], p[0]);
    out[o.id] = [r * Math.cos(a0 + speed * t), p[1], r * Math.sin(a0 + speed * t)];
  }
  return out;
}