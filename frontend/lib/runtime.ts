import { BUILTIN_VARS, FORBIDDEN, compile, type Fn, type Scope } from "./expr";
import type { SceneObject, Theory, Vec3 } from "./types";

export type ParamValues = Record<string, number>;
type Triple = [Fn, Fn, Fn];

export interface Runtime {
  scope: Scope;
  errors: string[];
  prepare: (values: ParamValues, t: number) => void;
  motion: Map<string, Triple>;
  surface: { height: Fn; range: Fn } | null;
  field: Triple | null;
  swarm: Triple | null;
}

export function defaultValues(theory: Theory): ParamValues {
  const out: ParamValues = {};
  for (const p of theory.parameters) out[p.id] = p.default;
  return out;
}

export function buildRuntime(theory: Theory): Runtime {
  const errors: string[] = [];
  const names = new Set<string>(BUILTIN_VARS);
  const derivedSpecs = theory.derived ?? [];
  for (const p of theory.parameters) if (!FORBIDDEN.has(p.id)) names.add(p.id);
  for (const d of derivedSpecs) if (!FORBIDDEN.has(d.id)) names.add(d.id);

  const build = (label: string, src: string, fallback: number): Fn => {
    try {
      return compile(src, names);
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : "invalid"} in "${src}"`);
      return () => fallback;
    }
  };
  const triple = (label: string, srcs: [string, string, string], fb: Vec3): Triple => [
    build(`${label}.x`, srcs[0], fb[0]),
    build(`${label}.y`, srcs[1], fb[1]),
    build(`${label}.z`, srcs[2], fb[2]),
  ];
  const derived = derivedSpecs.map((d) => ({ id: d.id, fn: build(`derived ${d.id}`, d.expr, 0) }));
  const motion = new Map<string, Triple>();
  for (const o of theory.objects) {
    if (o.motion) motion.set(o.id, triple(o.id, o.motion, o.initial_position));
  }
  const s = theory.surface;
  const f = theory.field;
  const w = theory.swarm;
  const scope: Scope = {};
  for (const v of BUILTIN_VARS) scope[v] = 0;

  return {
    scope,
    errors,
    motion,
    surface: s ? { height: build("surface.height", s.height, 0), range: build("surface.range", s.range, 1) } : null,
    field: f ? triple("field", [f.fx, f.fy, f.fz], [0, 0, 0]) : null,
    swarm: w ? triple("swarm", [w.x, w.y, w.z], [0, 0, 0]) : null,
    prepare: (values, t) => {
      for (const p of theory.parameters) scope[p.id] = values[p.id] ?? p.default;
      scope.t = t;
      for (const d of derived) scope[d.id] = d.fn(scope);
    },
  };
}

export function bodyPosition(rt: Runtime, o: SceneObject, out: Vec3): Vec3 {
  const m = rt.motion.get(o.id);
  if (m) {
    out[0] = m[0](rt.scope);
    out[1] = m[1](rt.scope);
    out[2] = m[2](rt.scope);
  } else {
    out[0] = o.initial_position[0];
    out[1] = o.initial_position[1];
    out[2] = o.initial_position[2];
  }
  return out;
}
