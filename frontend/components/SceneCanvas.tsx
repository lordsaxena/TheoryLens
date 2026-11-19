"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, Stars } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { Theory } from "@/lib/types";
import type { ParamValues, Runtime } from "@/lib/runtime";
import Bodies from "./scenes/Bodies";
import Links from "./scenes/Links";
import Surface from "./scenes/Surface";
import FieldFlow from "./scenes/FieldFlow";
import Swarm from "./scenes/Swarm";

const CAMERA_START: [number, number, number] = [10, 7, 13];

interface Props {
  theory: Theory;
  rt: Runtime;
  values: ParamValues;
  playing: boolean;
  onTogglePlay: () => void;
  resetNonce: number;
  onReset: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface WorldProps extends Omit<Props, "onTogglePlay" | "onReset"> {
  clockRef: { current: HTMLElement | null };
}

function World({ theory, rt, values, playing, resetNonce, selectedId, onSelect, clockRef }: WorldProps) {
  const timeRef = useRef(0);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);

  useFrame((_, delta) => {
    if (playing) timeRef.current += Math.min(delta, 0.05);
    if (clockRef.current) clockRef.current.textContent = `t = ${timeRef.current.toFixed(1)} s`;
  });

  useEffect(() => {
    timeRef.current = 0;
    camera.position.set(CAMERA_START[0], CAMERA_START[1], CAMERA_START[2]);
    const c = controls.current;
    if (c) {
      c.target.set(0, 0, 0);
      c.update();
    }
  }, [resetNonce, theory, camera]);

  const groundY = theory.surface ? -5 : -1.5;

  return (
    <>
      <color attach="background" args={["#020617"]} />
      <fog attach="fog" args={["#020617", 28, 80]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 12, 6]} intensity={1.6} />
      <directionalLight position={[-8, 4, -6]} intensity={0.5} color="#76b900" />
      <Stars radius={80} depth={40} count={2500} factor={3} fade speed={0.4} />
      <Grid position={[0, groundY, 0]} infiniteGrid cellSize={1} sectionSize={5} cellThickness={0.5}
        sectionThickness={1} cellColor="#1e293b" sectionColor="#3f6212" fadeDistance={45} fadeStrength={1.5} />
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} />

      {theory.surface && rt.surface && <Surface spec={theory.surface} fns={rt.surface} rt={rt} values={values} timeRef={timeRef} />}
      {theory.field && rt.field && <FieldFlow spec={theory.field} fns={rt.field} rt={rt} values={values} timeRef={timeRef} />}
      {theory.swarm && rt.swarm && <Swarm spec={theory.swarm} fns={rt.swarm} rt={rt} values={values} timeRef={timeRef} />}
      <Links theory={theory} rt={rt} values={values} timeRef={timeRef} />
      <Bodies theory={theory} rt={rt} values={values} timeRef={timeRef} selectedId={selectedId} onSelect={onSelect} />

      <EffectComposer multisampling={4}>
        <Bloom intensity={0.9} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur />
        <Vignette offset={0.25} darkness={0.7} />
      </EffectComposer>
    </>
  );
}

export default function SceneCanvas({ theory, rt, values, playing, onTogglePlay, resetNonce, onReset, selectedId, onSelect }: Props) {
  const clockRef = useRef<HTMLSpanElement>(null);

  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: CAMERA_START, fov: 50 }} dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={() => onSelect(null)}>
        <World theory={theory} rt={rt} values={values} playing={playing} resetNonce={resetNonce}
          selectedId={selectedId} onSelect={onSelect} clockRef={clockRef} />
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 backdrop-blur">
        <div className="text-sm font-semibold text-slate-100">{theory.title}</div>
        <div className="text-xs text-[#76b900]">{theory.domain}</div>
      </div>

      <span ref={clockRef} className="pointer-events-none absolute bottom-5 right-4 rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 font-mono text-xs text-slate-300 backdrop-blur">
        t = 0.0 s
      </span>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-slate-800 bg-slate-950/70 p-1.5 backdrop-blur">
        <button type="button" onClick={onTogglePlay}
          className="flex items-center gap-1.5 rounded-full bg-[#76b900] px-4 py-1.5 text-sm font-semibold text-slate-950 hover:brightness-110">
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onReset}
          className="flex items-center gap-1.5 rounded-full border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:border-[#76b900] hover:text-[#76b900]">
          <RotateCcw size={14} /> Reset
        </button>
      </div>
    </div>
  );
}
