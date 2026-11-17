"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { RefObject } from "react";
import type { Theory } from "@/lib/types";
import { computeObjectPositions, isStatic, type ParamValues } from "@/lib/physics";

interface Props {
  theory: Theory;
  values: ParamValues;
  timeRef: RefObject<number>;
}

export default function SpringLink({ theory, values, timeRef }: Props) {
  const ref = useRef<Mesh>(null);

  useFrame(() => {
    const m = ref.current;
    const anchor = theory.objects.find((o) => isStatic(o.id));
    const mover = theory.objects.find((o) => !isStatic(o.id));
    if (!m || !anchor || !mover) return;
    const pos = computeObjectPositions(theory, values, timeRef.current ?? 0);
    const a = pos[anchor.id];
    const b = pos[mover.id];
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    m.scale.set(Math.max(Math.abs(b[0] - a[0]), 0.05), 1, 1);
  });

  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 0.08, 0.08]} />
      <meshStandardMaterial color="#94a3b8" emissive="#94a3b8" emissiveIntensity={0.3} />
    </mesh>
  );
}