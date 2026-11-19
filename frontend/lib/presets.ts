export const PRESETS = [
  {
    id: "oscillator",
    label: "Damped Harmonic Oscillator",
    prompt: "Damped harmonic oscillator: m x'' + b x' + k x = 0, a mass on a spring losing energy to friction.",
  },
  {
    id: "orbit",
    label: "Orbital Gravity Well",
    prompt: "Orbital gravity well: Newtonian gravity F = -GMm/r^2 and Kepler orbits around a central mass.",
  },
  {
    id: "wave",
    label: "3D Wave Interference",
    prompt: "3D wave interference of two point sources: psi = sum A sin(k r_i - omega t).",
  },
  {
    id: "dipole",
    label: "Rotating Electric Dipole",
    prompt: "Electric field of a dipole: E = kq(r - r+)/|r - r+|^3 - kq(r - r-)/|r - r-|^3.",
  },
] as const;
