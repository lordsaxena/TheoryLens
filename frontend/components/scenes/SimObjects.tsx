"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import type { RefObject } from "react";
import type { Theory } from "@/lib/types";
import { computeObjectPositions, type ParamValues } from "@/lib/physics";

interface Props {
  theory: Theory;
  values: ParamValues;
  timeRef: RefObject<number>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function ShapeGeometry({ shape }: { shape: string }) {
  switch (shape) {
    case "box":
      return <boxGeometry args={[0.8, 0.8, 0.8]} />;
    case "cone":
      return <coneGeometry args={[0.4, 0.9, 24]} />;
    case "torus":
      return <torusGeometry args={[0.4, 0.14, 16, 32]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.3, 0.3, 0.9, 24]} />;
    default:
      return <sphereGeometry args={[0.4, 32, 32]} />;
  }
}

export default function SimObjects({ theory, values, timeRef, selectedId, onSelect }: Props) {
  const groups = useRef<Record<string, Group | null>>({});
  const coordRef = useRef<HTMLSpanElement>(null);

  useFrame(() => {
    const pos = computeObjectPositions(theory, values, timeRef.current ?? 0);
    for (const o of theory.objects) {
      const g = groups.current[o.id];
      const p = pos[o.id];
      if (g && p) g.position.set(p[0], p[1], p[2]);
    }
    if (selectedId && coordRef.current) {
      const p = pos[selectedId];
      if (p) {
        coordRef.current.textContent = `x ${p[0].toFixed(2)}   y ${p[1].toFixed(2)}   z ${p[2].toFixed(2)}`;
      }
    }
  });

  return (
    <>
      {theory.objects.map((o) => {
        const selected = o.id === selectedId;
        return (
          <group
            key={o.id}
            ref={(g) => {
              groups.current[o.id] = g;
            }}
          >
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onSelect(o.id);
              }}
              onPointerOver={() => {
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "auto";
              }}
              scale={selected ? 1.2 : 1}
            >
              <ShapeGeometry shape={o.shape} />
              <meshStandardMaterial
                color={o.color}
                emissive={o.color}
                emissiveIntensity={selected ? 0.9 : 0.35}
                roughness={0.3}
                metalness={0.4}
              />
            </mesh>
            {selected && (
              <Html position={[0, 1, 0]} center zIndexRange={[20, 0]}>
                <div className="pointer-events-none w-56 rounded-xl border border-white/15 bg-white/10 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur-md">
                  <div className="mb-1 flex items-center gap-2 font-semibold text-[#76b900]">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: o.color }} />
                    {o.id}
                  </div>
                  <span ref={coordRef} className="block font-mono text-[11px] text-slate-200">
                    —
                  </span>
                  {o.formula_hint && (
                    <div className="mt-2 border-t border-white/10 pt-2 font-mono text-[11px] text-slate-300">
                      {o.formula_hint}
                    </div>
                  )}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}