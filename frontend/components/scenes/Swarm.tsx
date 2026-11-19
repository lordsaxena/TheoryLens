/* eslint-disable react-hooks/immutability */
"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SwarmSpec } from "@/lib/types";
import type { Fn } from "@/lib/expr";
import type { ParamValues, Runtime } from "@/lib/runtime";
import { glowSprite } from "@/lib/sprite";

export default function Swarm({ spec, fns, rt, values, timeRef }: {
  spec: SwarmSpec; fns: [Fn, Fn, Fn]; rt: Runtime; values: ParamValues; timeRef: { current: number };
}) {
  const count = Math.min(12000, Math.max(1, Math.floor(spec.count)));
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const col = new Float32Array(count * 3);
    const a = new THREE.Color(spec.color_a);
    const b = new THREE.Color(spec.color_b);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.copy(a).lerp(b, i / count);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [count, spec.color_a, spec.color_b]);
  const sprite = useMemo(() => glowSprite(), []);

  useFrame(() => {
    rt.prepare(values, timeRef.current);
    const s = rt.scope;
    s.cnt = count;
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const [fx, fy, fz] = fns;
    for (let i = 0; i < count; i++) {
      s.idx = i;
      s.u = i / count;
      arr[i * 3] = fx(s);
      arr[i * 3 + 1] = fy(s);
      arr[i * 3 + 2] = fz(s);
    }
    attr.needsUpdate = true;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial map={sprite} size={spec.size} sizeAttenuation vertexColors transparent
        depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}
