/* eslint-disable react-hooks/immutability */
"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FieldSpec } from "@/lib/types";
import type { Fn } from "@/lib/expr";
import type { ParamValues, Runtime } from "@/lib/runtime";
import { glowSprite } from "@/lib/sprite";

const UP = new THREE.Vector3(0, 1, 0);
const COOL = new THREE.Color("#0ea5e9");
const HOT = new THREE.Color("#facc15");
const TRACERS = 1600;
const lin = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

export default function FieldFlow({ spec, fns, rt, values, timeRef }: {
  spec: FieldSpec; fns: [Fn, Fn, Fn]; rt: Runtime; values: ParamValues; timeRef: { current: number };
}) {
  const ext = Math.max(spec.extent, 1);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lastT = useRef(0);
  const ready = useRef(false);
  const arrowGeo = useMemo(() => {
    const shaft = new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8);
    shaft.translate(0, 0.275, 0);
    const head = new THREE.ConeGeometry(0.075, 0.22, 12);
    head.translate(0, 0.66, 0);
    return mergeGeometries([shaft, head]) ?? shaft;
  }, []);
  const cells = useMemo(() => {
    const out: number[] = [];
    for (const x of lin(-ext, ext, 7))
      for (const y of lin(-ext / 2, ext / 2, 5))
        for (const z of lin(-ext, ext, 7)) out.push(x, y, z);
    return new Float32Array(out);
  }, [ext]);
  const n = cells.length / 3;
  const vec = useMemo(() => new Float32Array(n * 3), [n]);
  const mags = useMemo(() => new Float32Array(n), [n]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const sprite = useMemo(() => glowSprite(), []);
  const tracer = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRACERS * 3), 3));
    return { geo, age: new Float32Array(TRACERS), life: new Float32Array(TRACERS) };
  }, []);

  useFrame(() => {
    const t = timeRef.current;
    rt.prepare(values, t);
    const s = rt.scope;
    const [fx, fy, fz] = fns;
    const m = mesh.current;
    if (!m) return;
    let mx = 1e-9;
    for (let i = 0; i < n; i++) {
      s.x = cells[i * 3]; s.y = cells[i * 3 + 1]; s.z = cells[i * 3 + 2];
      const a = fx(s), b = fy(s), c = fz(s);
      vec[i * 3] = a; vec[i * 3 + 1] = b; vec[i * 3 + 2] = c;
      const mag = Math.hypot(a, b, c);
      mags[i] = mag;
      if (mag > mx) mx = mag;
    }
    for (let i = 0; i < n; i++) {
      const mag = mags[i];
      const k = Math.pow(mag / mx, 0.4);
      dummy.position.set(cells[i * 3], cells[i * 3 + 1], cells[i * 3 + 2]);
      if (mag > 1e-9) dummy.quaternion.setFromUnitVectors(UP, dir.set(vec[i * 3] / mag, vec[i * 3 + 1] / mag, vec[i * 3 + 2] / mag));
      dummy.scale.set(0.6 + 0.5 * k, 0.35 + 0.9 * k, 0.6 + 0.5 * k);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, tint.copy(COOL).lerp(HOT, k));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    if (!spec.flow) return;
    const attr = tracer.geo.getAttribute("position") as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    const respawn = (i: number, randomAge: boolean) => {
      p[i * 3] = (Math.random() * 2 - 1) * ext;
      p[i * 3 + 1] = (Math.random() * 2 - 1) * ext * 0.5;
      p[i * 3 + 2] = (Math.random() * 2 - 1) * ext;
      tracer.life[i] = 3 + Math.random() * 5;
      tracer.age[i] = randomAge ? Math.random() * tracer.life[i] : 0;
    };
    if (!ready.current) {
      for (let i = 0; i < TRACERS; i++) respawn(i, true);
      ready.current = true;
    }
    const dt = t - lastT.current;
    lastT.current = t;
    if (dt <= 0 || dt > 0.2) return;
    for (let i = 0; i < TRACERS; i++) {
      s.x = p[i * 3]; s.y = p[i * 3 + 1]; s.z = p[i * 3 + 2];
      const a = fx(s), b = fy(s), c = fz(s);
      const mag = Math.hypot(a, b, c);
      if (mag < 1e-9) { respawn(i, false); continue; }
      const k = Math.min(1.5, Math.pow(mag / mx, 0.4));
      const step = ((0.8 + 2.0 * k) * dt) / mag;
      p[i * 3] += a * step; p[i * 3 + 1] += b * step; p[i * 3 + 2] += c * step;
      tracer.age[i] += dt;
      if (tracer.age[i] > tracer.life[i] || Math.abs(p[i * 3]) > ext * 1.1 ||
        Math.abs(p[i * 3 + 1]) > ext * 0.6 || Math.abs(p[i * 3 + 2]) > ext * 1.1) respawn(i, false);
    }
    attr.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[arrowGeo, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.35} metalness={0.2} emissive="#0ea5e9" emissiveIntensity={0.25} />
      </instancedMesh>
      {spec.flow && (
        <points geometry={tracer.geo} frustumCulled={false}>
          <pointsMaterial map={sprite} size={0.16} sizeAttenuation transparent depthWrite={false}
            blending={THREE.AdditiveBlending} color="#bae6fd" />
        </points>
      )}
    </group>
  );
}
