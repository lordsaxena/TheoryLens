/**
 * Tiny formula compiler. AI-written formulas are parsed by a strict grammar and turned
 * into JavaScript that can only call whitelisted math helpers. No eval of raw text.
 */
export type Scope = Record<string, number>;
export type Fn = (s: Scope) => number;
type Helper = (...a: number[]) => number;

export const BUILTIN_VARS = ["t", "x", "y", "z", "r", "idx", "cnt", "u"] as const;
export const FORBIDDEN = new Set(["constructor", "__proto__", "prototype", "toString", "valueOf", "hasOwnProperty"]);

function keplerE(m: number, e: number): number {
  const tau = Math.PI * 2;
  const mm = ((m % tau) + tau) % tau;
  const ec = Math.min(Math.max(e, 0), 0.95);
  let big = ec > 0.8 ? Math.PI : mm;
  for (let i = 0; i < 10; i++) big -= (big - ec * Math.sin(big) - mm) / (1 - ec * Math.cos(big));
  return big;
}

export const HELPERS: Record<string, Helper> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  log: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  hypot: Math.hypot,
  step: (v) => (v > 0 ? 1 : 0),
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  mod: (a, b) => (b === 0 ? 0 : ((a % b) + b) % b),
  kepler: (m, e) => keplerE(m, e),
};

const FUNCS = new Set(Object.keys(HELPERS));
const CONSTS = new Map<string, string>([
  ["pi", "Math.PI"],
  ["e", "Math.E"],
]);

interface Tok {
  k: "num" | "id" | "op";
  v: string;
}

const TOKEN = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|([-+*/^%(),]))/y;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let pos = 0;
  while (pos < src.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) {
      if (src.slice(pos).trim() === "") break;
      throw new Error(`unexpected character near "${src.slice(pos, pos + 6).trim()}"`);
    }
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push({ k: "num", v: m[1] });
    else if (m[2] !== undefined) out.push({ k: "id", v: m[2] });
    else out.push({ k: "op", v: m[3] });
  }
  return out;
}

class Parser {
  private p = 0;

  constructor(private toks: Tok[], private names: ReadonlySet<string>) {}

  parse(): string {
    const code = this.expr();
    if (this.p < this.toks.length) throw new Error(`unexpected "${this.toks[this.p].v}"`);
    return code;
  }

  private eat(v: string): boolean {
    const t = this.toks[this.p];
    if (t && t.k === "op" && t.v === v) {
      this.p++;
      return true;
    }
    return false;
  }

  private expr(): string {
    let a = this.term();
    for (;;) {
      if (this.eat("+")) a = `(${a}+${this.term()})`;
      else if (this.eat("-")) a = `(${a}-${this.term()})`;
      else return a;
    }
  }

  private term(): string {
    let a = this.unary();
    for (;;) {
      if (this.eat("*")) a = `(${a}*${this.unary()})`;
      else if (this.eat("/")) a = `(${a}/${this.unary()})`;
      else if (this.eat("%")) a = `(${a}%${this.unary()})`;
      else return a;
    }
  }

  private unary(): string {
    if (this.eat("-")) return `(-${this.unary()})`;
    if (this.eat("+")) return this.unary();
    return this.power();
  }

  private power(): string {
    const base = this.atom();
    if (this.eat("^")) return `Math.pow(${base},${this.unary()})`;
    return base;
  }

  private atom(): string {
    const t = this.toks[this.p++];
    if (!t) throw new Error("expression ended early");
    if (t.k === "num") return t.v;
    if (t.k === "id") {
      if (this.eat("(")) {
        if (!FUNCS.has(t.v)) throw new Error(`unknown function "${t.v}"`);
        const args: string[] = [];
        if (!this.eat(")")) {
          do {
            args.push(this.expr());
          } while (this.eat(","));
          if (!this.eat(")")) throw new Error("missing )");
        }
        return `F.${t.v}(${args.join(",")})`;
      }
      if (this.names.has(t.v)) return `s.${t.v}`;
      const c = CONSTS.get(t.v);
      if (c) return c;
      throw new Error(`unknown name "${t.v}"`);
    }
    if (t.v === "(") {
      const c = this.expr();
      if (!this.eat(")")) throw new Error("missing )");
      return `(${c})`;
    }
    throw new Error(`unexpected "${t.v}"`);
  }
}

export function compile(src: string, names: ReadonlySet<string>): Fn {
  const cleaned = src
    .replace(/\bMath\./g, "")
    .replace(/\*\*/g, "^")
    .replace(/\u2212/g, "-")
    .replace(/π/g, "pi");
  const code = new Parser(tokenize(cleaned), names).parse();
  const make = new Function(
    "F",
    `"use strict"; return (s) => { const v = ${code}; return Number.isFinite(v) ? v : 0; };`,
  ) as (f: Record<string, Helper>) => Fn;
  return make(HELPERS);
}
