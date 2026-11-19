/* eslint-disable react-hooks/immutability */
"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SurfaceSpec } from "@/lib/types";
import type { Fn } from "@/lib/expr";
import type { ParamValues, Runtime } from "@/lib/runtime";

const SEG = 96;

export default function Surface({ spec, fns, rt, values, timeRef }: {
  spec: SurfaceSpec; fns: { height: Fn; range: Fn }; rt: Runtime; values: ParamValues; timeRef: { current: number };
}) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(spec.size, spec.size, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }, [spec.size]);
  const low = useMemo(() => new THREE.Color(spec.low), [spec.low]);
  const high = useMemo(() => new THREE.Color(spec.high), [spec.high]);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    rt.prepare(values, timeRef.current);
    const s = rt.scope;
    s.y = 0;
    const range = Math.max(Math.abs(fns.range(s)), 1e-3);
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = geometry.getAttribute("color") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      s.x = x; s.z = z; s.r = Math.hypot(x, z);
      const h = fns.height(s);
      pos.setY(i, h);
      const k = Math.min(1, Math.max(0, 0.5 + (0.5 * h) / range));
      tmp.copy(low).lerp(high, k);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <group>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial vertexColors side={THREE.DoubleSide} roughness={0.22} metalness={0.1} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={spec.high} wireframe transparent opacity={0.07} depthWrite={false} />
      </mesh>
    </group>
  );
}
