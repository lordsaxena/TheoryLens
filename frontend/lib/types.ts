export type SimulationType = "wave_field" | "particle_kinematics" | "vector_field";
export type Vec3 = [number, number, number];

export interface SimParameter {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
}

export interface Derived {
  id: string;
  expr: string;
}

export interface SceneObject {
  id: string;
  shape: "sphere" | "box" | "cone" | "torus" | "cylinder";
  color: string;
  initial_position: Vec3;
  formula_hint: string;
  motion?: [string, string, string] | null;
  trail?: boolean;
  glow?: boolean;
  size?: number;
}

export interface LinkSpec {
  source: string;
  target: string;
  kind: "spring" | "rod";
}

export interface SurfaceSpec {
  height: string;
  range: string;
  size: number;
  low: string;
  high: string;
}

export interface FieldSpec {
  fx: string;
  fy: string;
  fz: string;
  extent: number;
  flow: boolean;
}

export interface SwarmSpec {
  x: string;
  y: string;
  z: string;
  count: number;
  color_a: string;
  color_b: string;
  size: number;
}

export interface Theory {
  title: string;
  domain: string;
  simulation_type: SimulationType;
  summary: string;
  equations: string[];
  parameters: SimParameter[];
  derived?: Derived[];
  objects: SceneObject[];
  links?: LinkSpec[];
  surface?: SurfaceSpec | null;
  field?: FieldSpec | null;
  swarm?: SwarmSpec | null;
}

export interface ParseResponse {
  theory: Theory;
  source: "nvidia-nim" | "fallback-preset";
  model: string | null;
  extracted_text: string | null;
}

export interface BenchmarkResult {
  gpu_ms: number;
  cpu_ms: number;
  speedup_factor: number;
  gpu_available: boolean;
  backend: string;
  device: string;
  grid_size: number;
  steps: number;
}
