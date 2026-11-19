"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { SceneObject, Theory, Vec3 } from "@/lib/types";
import { bodyPosition, type ParamValues, type Runtime } from "@/lib/runtime";

const TRAIL_POINTS = 260;

interface TrailState {
  line: THREE.Line;
  pos: Float32Array;
  primed: boolean;
}

function makeTrail(color: string): TrailState {
  const pos = new Float32Array(TRAIL_POINTS * 3);
  const col = new Float32Array(TRAIL_POINTS * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < TRAIL_POINTS; i++) {
    const f = (i / (TRAIL_POINTS - 1)) ** 2;
    col[i * 3] = c.r * f;
    col[i * 3 + 1] = c.g * f;
    col[i * 3 + 2] = c.b * f;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  line.frustumCulled = false;
  return { line, pos, primed: false };
}

function pushTrail(tr: TrailState, p: Vec3, restart: boolean) {
  const a = tr.pos;
  if (restart || !tr.primed) {
    for (let i = 0; i < TRAIL_POINTS; i++) {
      a[i * 3] = p[0]; a[i * 3 + 1] = p[1]; a[i * 3 + 2] = p[2];
    }
    tr.primed = true;
  } else {
    a.copyWithin(0, 3);
  }
  const o = (TRAIL_POINTS - 1) * 3;
  a[o] = p[0]; a[o + 1] = p[1]; a[o + 2] = p[2];
  (tr.line.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
}

function ShapeGeometry({ shape, size }: { shape: SceneObject["shape"]; size: number }) {
  const s = size;
  switch (shape) {
    case "box": return <boxGeometry args={[0.8 * s, 0.8 * s, 0.8 * s]} />;
    case "cone": return <coneGeometry args={[0.4 * s, 0.9 * s, 32]} />;
    case "torus": return <torusGeometry args={[0.4 * s, 0.14 * s, 24, 48]} />;
    case "cylinder": return <cylinderGeometry args={[0.3 * s, 0.3 * s, 0.9 * s, 32]} />;
    default: return <sphereGeometry args={[0.4 * s, 48, 48]} />;
  }
}

interface BodyProps {
  obj: SceneObject;
  rt: Runtime;
  values: ParamValues;
  timeRef: { current: number };
  selected: boolean;
  onSelect: (id: string | null) => void;
}

function Body({ obj, rt, values, timeRef, selected, onSelect }: BodyProps) {
  const group = useRef<THREE.Group>(null);
  const coord = useRef<HTMLSpanElement>(null);
  const lastT = useRef(0);
  const tmp = useMemo<Vec3>(() => [0, 0, 0], []);
  const trail = useMemo(() => (obj.trail ? makeTrail(obj.color) : null), [obj.trail, obj.color]);
  const size = obj.size ?? 1;

  useFrame(() => {
    const t = timeRef.current;
    rt.prepare(values, t);
    const p = bodyPosition(rt, obj, tmp);
    group.current?.position.set(p[0], p[1], p[2]);
    if (coord.current) coord.current.textContent = `x ${p[0].toFixed(2)}   y ${p[1].toFixed(2)}   z ${p[2].toFixed(2)}`;
    if (trail && t !== lastT.current) pushTrail(trail, p, t < lastT.current);
    lastT.current = t;
  });

  return (
    <>
      <group ref={group}>
        <mesh scale={selected ? 1.15 : 1} onClick={(e) => { e.stopPropagation(); onSelect(obj.id); }}
          onPointerOver={() => { document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { document.body.style.cursor = "auto"; }}>
          <ShapeGeometry shape={obj.shape} size={size} />
          <meshPhysicalMaterial color={obj.color} emissive={obj.color}
            emissiveIntensity={obj.glow ? 1.4 : selected ? 0.7 : 0.18}
            roughness={0.28} metalness={0.15} clearcoat={1} clearcoatRoughness={0.15} />
        </mesh>
        {obj.glow && <pointLight color={obj.color} intensity={40} distance={30} decay={2} />}
        {selected && (
          <Html position={[0, 0.7 * size + 0.3, 0]} center zIndexRange={[20, 0]}>
            <div className="pointer-events-none w-60 rounded-xl border border-white/15 bg-white/10 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur-md">
              <div className="mb-1 flex items-center gap-2 font-semibold text-[#76b900]">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: obj.color }} />{obj.id}
              </div>
              <span ref={coord} className="block font-mono text-[11px] text-slate-200">—</span>
              {obj.formula_hint && <div className="mt-2 border-t border-white/10 pt-2 font-mono text-[11px] text-slate-300">{obj.formula_hint}</div>}
            </div>
          </Html>
        )}
      </group>
      {trail && <primitive object={trail.line} />}
    </>
  );
}

interface Props {
  theory: Theory;
  rt: Runtime;
  values: ParamValues;
  timeRef: { current: number };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function Bodies({ theory, rt, values, timeRef, selectedId, onSelect }: Props) {
  return (
    <>
      {theory.objects.map((o) => (
        <Body key={o.id} obj={o} rt={rt} values={values} timeRef={timeRef} selected={o.id === selectedId} onSelect={onSelect} />
      ))}
    </>
  );
}
