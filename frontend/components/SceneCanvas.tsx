"use client";

import { useEffect, useRef, type ElementRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { Theory } from "@/lib/types";
import { hasParam, type ParamValues } from "@/lib/physics";
import SimObjects from "./scenes/SimObjects";
import WaveSurface from "./scenes/WaveSurface";
import FieldArrows from "./scenes/FieldArrows";
import SpringLink from "./scenes/SpringLink";

const CAMERA_START = [9, 7, 11] as const;

interface Props {
  theory: Theory | null;
  values: ParamValues;
  playing: boolean;
  onTogglePlay: () => void;
  resetNonce: number;
  onReset: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

type WorldProps = Pick<Props, "theory" | "values" | "playing" | "resetNonce" | "selectedId" | "onSelect">;

function World({ theory, values, playing, resetNonce, selectedId, onSelect }: WorldProps) {
  const timeRef = useRef(0);
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);

  useFrame((_, delta) => {
    if (playing) timeRef.current += Math.min(delta, 0.05);
  });

  // Reset simulation clock + camera on Reset press or when a new theory loads.
  useEffect(() => {
    timeRef.current = 0;
    camera.position.set(CAMERA_START[0], CAMERA_START[1], CAMERA_START[2]);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [resetNonce, theory, camera]);

  const type = theory?.simulation_type;

  return (
    <>
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 6]} intensity={1.3} />
      <pointLight position={[-6, 4, -6]} intensity={30} color="#76b900" />
      <gridHelper args={[20, 20, "#76b900", "#1e293b"]} position={[0, type === "wave_field" ? -2 : 0, 0]} />
      <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} />

      {theory && (
        <>
          {type === "wave_field" && <WaveSurface theory={theory} values={values} timeRef={timeRef} />}
          {type === "vector_field" && <FieldArrows theory={theory} values={values} />}
          {type === "particle_kinematics" && hasParam(theory, "stiffness") && (
            <SpringLink theory={theory} values={values} timeRef={timeRef} />
          )}
          <SimObjects
            theory={theory}
            values={values}
            timeRef={timeRef}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </>
      )}
    </>
  );
}

export default function SceneCanvas({ theory, values, playing, onTogglePlay, resetNonce, onReset, selectedId, onSelect }: Props) {
  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [CAMERA_START[0], CAMERA_START[1], CAMERA_START[2]], fov: 50 }}
        dpr={[1, 2]}
        onPointerMissed={() => onSelect(null)}
      >
        <World
          theory={theory}
          values={values}
          playing={playing}
          resetNonce={resetNonce}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 backdrop-blur">
        <div className="text-sm font-semibold text-slate-100">{theory?.title ?? "No simulation loaded"}</div>
        <div className="text-xs text-[#76b900]">
          {theory ? `${theory.domain} · ${theory.simulation_type}` : "Pick a preset or enter a theory"}
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-slate-800 bg-slate-950/70 p-1.5 backdrop-blur">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex items-center gap-1.5 rounded-full bg-[#76b900] px-4 py-1.5 text-sm font-semibold text-slate-950 hover:brightness-110"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-full border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:border-[#76b900] hover:text-[#76b900]"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
    </div>
  );
}