"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { LinkSpec, SceneObject, Theory, Vec3 } from "@/lib/types";
import { bodyPosition, type ParamValues, type Runtime } from "@/lib/runtime";

const SEG = 180;
const COILS = 11;

function LinkLine({ link, a, b, rt, values, timeRef }: {
  link: LinkSpec; a: SceneObject; b: SceneObject; rt: Runtime; values: ParamValues; timeRef: { current: number };
}) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SEG * 3), 3));
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#e2e8f0" }));
    l.frustumCulled = false;
    return l;
  }, []);
  const pa = useMemo<Vec3>(() => [0, 0, 0], []);
  const pb = useMemo<Vec3>(() => [0, 0, 0], []);

  useFrame(() => {
    rt.prepare(values, timeRef.current);
    bodyPosition(rt, a, pa);
    bodyPosition(rt, b, pb);
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2];
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const rx = Math.abs(uy) < 0.9 ? 0 : 1;
    const ry = Math.abs(uy) < 0.9 ? 1 : 0;
    let v1x = -uz * ry, v1y = uz * rx, v1z = ux * ry - uy * rx;
    const vl = Math.hypot(v1x, v1y, v1z) || 1;
    v1x /= vl; v1y /= vl; v1z /= vl;
    const v2x = uy * v1z - uz * v1y, v2y = uz * v1x - ux * v1z, v2z = ux * v1y - uy * v1x;
    const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let k = 0; k < SEG; k++) {
      const s = k / (SEG - 1);
      const amp = link.kind === "spring" ? 0.3 * Math.min(1, s / 0.08, (1 - s) / 0.08) : 0;
      const th = Math.PI * 2 * COILS * s;
      const c = Math.cos(th) * amp, sn = Math.sin(th) * amp;
      arr[k * 3] = pa[0] + ux * len * s + v1x * c + v2x * sn;
      arr[k * 3 + 1] = pa[1] + uy * len * s + v1y * c + v2y * sn;
      arr[k * 3 + 2] = pa[2] + uz * len * s + v1z * c + v2z * sn;
    }
    attr.needsUpdate = true;
  });
  return <primitive object={line} />;
}

export default function Links({ theory, rt, values, timeRef }: {
  theory: Theory; rt: Runtime; values: ParamValues; timeRef: { current: number };
}) {
  return (
    <>
      {(theory.links ?? []).map((l, i) => {
        const a = theory.objects.find((o) => o.id === l.source);
        const b = theory.objects.find((o) => o.id === l.target);
        if (!a || !b) return null;
        return <LinkLine key={i} link={l} a={a} b={b} rt={rt} values={values} timeRef={timeRef} />;
      })}
    </>
  );
}
