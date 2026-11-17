"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { Theory } from "@/lib/types";
import { pv, type ParamValues } from "@/lib/physics";

interface Props {
  theory: Theory;
  values: ParamValues;
  timeRef: RefObject<number>;
}

export default function WaveSurface({ values, timeRef }: Props) {
  const meshRef = useRef<Mesh>(null);
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const size = 12;
    const divisions = 32;
    for (let iz = 0; iz <= divisions; iz++) {
      const z = -size / 2 + (iz / divisions) * size;
      for (let ix = 0; ix <= divisions; ix++) {
        const x = -size / 2 + (ix / divisions) * size;
        positions.push(x, 0, z);
      }
    }
    for (let iz = 0; iz < divisions; iz++) {
      for (let ix = 0; ix < divisions; ix++) {
        const a = iz * (divisions + 1) + ix;
        const b = a + 1;
        const c = a + divisions + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    return { positions: new Float32Array(positions), indices };
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const position = mesh.geometry.attributes.position;
    const amplitude = pv(values, ["amplitude", "A"], 0.6);
    const wavelength = pv(values, ["wavelength", "lambda", "lambda_m"], 2.5);
    const frequency = pv(values, ["frequency", "f"], 1);
    const separation = pv(values, ["separation", "d"], 5);
    const t = timeRef.current ?? 0;
    const k = (Math.PI * 2) / wavelength;
    const omega = Math.PI * 2 * frequency;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const r1 = Math.hypot(x + separation / 2, z);
      const r2 = Math.hypot(x - separation / 2, z);
      position.setY(i, amplitude * (Math.sin(k * r1 - omega * t) + Math.sin(k * r2 - omega * t)));
    }
    position.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} position={[0, -1.2, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[geometry.positions, 3]} />
        <bufferAttribute attach="index" args={[new Uint32Array(geometry.indices), 1]} />
      </bufferGeometry>
      <meshStandardMaterial color="#0ea5e9" emissive="#76b900" emissiveIntensity={0.08} roughness={0.35} metalness={0.25} wireframe />
    </mesh>
  );
}
