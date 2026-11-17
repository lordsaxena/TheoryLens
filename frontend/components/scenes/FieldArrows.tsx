"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Theory, Vec3 } from "@/lib/types";
import { fieldAt, pv, type ParamValues } from "@/lib/physics";

interface Props {
  theory: Theory;
  values: ParamValues;
}

const UP = new THREE.Vector3(0, 1, 0);
const COOL = new THREE.Color("#0ea5e9");
const HOT = new THREE.Color("#76b900");

export default function FieldArrows({ theory, values }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const center = useMemo<Vec3>(
    () => theory.objects[0]?.initial_position ?? [0, 0, 0],
    [theory.objects],
  );

  const points = useMemo(() => {
    const pts: Vec3[] = [];
    for (const x of [-6, -3, 0, 3, 6]) {
      for (const y of [-3, 0, 3]) {
        for (const z of [-6, -3, 0, 3, 6]) {
          if (Math.hypot(x - center[0], y - center[1], z - center[2]) > 1.4) pts.push([x, y, z]);
        }
      }
    }
    return pts;
  }, [center]);

  const strength = pv(values, ["central_mass", "source_strength", "strength", "M"], 10);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    points.forEach((p, i) => {
      const { dir, mag } = fieldAt(p, center, strength);
      const level = Math.log10(1 + mag);
      dummy.position.set(p[0], p[1], p[2]);
      dummy.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dir[0], dir[1], dir[2]));
      dummy.scale.set(1, Math.min(1.8, Math.max(0.35, 0.35 + 0.9 * level)), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(COOL).lerp(HOT, Math.min(1, level / 2));
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [points, center, strength]);

  return (
    <instancedMesh key={points.length} ref={meshRef} args={[undefined, undefined, points.length]} frustumCulled={false}>
      <coneGeometry args={[0.12, 0.6, 10]} />
      <meshStandardMaterial roughness={0.4} metalness={0.2} transparent opacity={0.85} />
    </instancedMesh>
  );
}