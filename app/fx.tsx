"use client";

/**
 * Motion + micro-interactions for the dashboard. Pure presentation — no data fetching.
 * Everything respects prefers-reduced-motion and pauses when off-screen.
 */
import { useEffect, useRef, useState } from "react";

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/* ASCII voice line: a live waveform drawn in characters.              */
/* Hover to "speak" (the wave swells under the cursor), click to ping. */
/* ------------------------------------------------------------------ */
const RAMP = " .:-=+*#%@";

export function AsciiWave({ label = "live line" }: { label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const [hint, setHint] = useState("hover to speak · click to ping");

  useEffect(() => {
    const el = box.current, out = pre.current;
    if (!el || !out) return;
    let cols = 80, rows = 9, raf = 0, last = 0, visible = true;
    const mouse = { x: -1, active: 0 };
    const pings: { x: number; t: number }[] = [];
    const t0 = performance.now();

    const measure = () => {
      const probe = document.createElement("span");
      probe.textContent = "M";
      out.appendChild(probe);
      const cw = probe.getBoundingClientRect().width || 8;
      const ch = probe.getBoundingClientRect().height || 14;
      out.removeChild(probe);
      cols = Math.max(20, Math.floor(el.clientWidth / cw));
      rows = Math.max(5, Math.floor(el.clientHeight / ch));
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < 33) return; // ~30fps
      last = now;
      const t = (now - t0) / 1000;
      mouse.active += ((mouse.x >= 0 ? 1 : 0) - mouse.active) * 0.08;
      const mid = (rows - 1) / 2;
      const lines: string[] = [];
      const amp: number[] = [];
      for (let x = 0; x < cols; x++) {
        const u = x / cols;
        // idle "breathing" voice + syllable bursts
        let a =
          0.28 +
          0.22 * Math.sin(x * 0.19 + t * 2.4) * Math.sin(x * 0.047 - t * 0.9) +
          0.18 * Math.max(0, Math.sin(t * 1.7 + u * 9)) * Math.sin(x * 0.6 + t * 6);
        a *= Math.sin(Math.PI * u) ** 0.6; // fade at the edges
        if (mouse.x >= 0) {
          const d = (x - mouse.x * cols) / (cols * 0.09);
          a += mouse.active * 0.75 * Math.exp(-d * d) * (0.75 + 0.25 * Math.sin(t * 14 + x));
        }
        for (const p of pings) {
          const age = t - p.t;
          const r = age * cols * 0.55;
          const d = Math.abs(x - p.x * cols) - r;
          a += Math.max(0, 1 - age / 1.6) * 0.9 * Math.exp(-(d * d) / 6);
        }
        amp.push(Math.min(1.05, Math.abs(a) * 1.65));
      }
      for (let i = pings.length - 1; i >= 0; i--) if (t - pings[i].t > 1.6) pings.splice(i, 1);
      for (let y = 0; y < rows; y++) {
        let line = "";
        const dy = Math.abs(y - mid) / (mid || 1);
        for (let x = 0; x < cols; x++) {
          const v = amp[x] - dy;
          if (v <= 0) line += dy < 0.08 && (x + Math.floor(t * 8)) % 4 === 0 ? "-" : " ";
          else line += RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(v * (RAMP.length - 1) * 2.2))];
        }
        lines.push(line);
      }
      out.textContent = lines.join("\n");
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width;
    };
    const onLeave = () => { mouse.x = -1; };
    const onClick = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      pings.push({ x: (e.clientX - r.left) / r.width, t: (performance.now() - t0) / 1000 });
      setHint("ping ✓ — the agent picks up in seconds");
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("click", onClick);
    if (reduced()) { frame(performance.now() + 1000); cancelAnimationFrame(raf); }
    else raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div className="ascii-wave" ref={box} role="img" aria-label="Animated voice waveform">
      <pre ref={pre} aria-hidden />
      <span className="ascii-label"><i className="rec" aria-hidden /> {label} <span className="dim-on">— {hint}</span></span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Count-up numbers (run once when scrolled into view).                */
/* ------------------------------------------------------------------ */
export function CountUp({ to, prefix = "", decimals = 0, duration = 1100 }: { to: number; prefix?: string; decimals?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = (n: number) => prefix + n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    el.textContent = fmt(0);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = fmt(to * eased);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  return <span ref={ref}>{fmt(to)}</span>;
}

/* ------------------------------------------------------------------ */
/* ASCII scramble: text decodes on mount and on hover of its parent.   */
/* ------------------------------------------------------------------ */
const GLYPHS = "!<>-_\\/[]{}=+*^?#%$&@01";

export function Scramble({ text, className, onMount = false }: { text: string; className?: string; onMount?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0, running = false;
    const run = () => {
      if (running) return;
      running = true;
      const start = performance.now();
      const len = text.length;
      const step = (now: number) => {
        const p = (now - start) / 520;
        let s = "";
        for (let i = 0; i < len; i++) {
          const ch = text[i];
          if (ch === " " || p > (i + 1) / len) s += ch;
          else s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        el.textContent = s;
        if (p < 1) raf = requestAnimationFrame(step);
        else { el.textContent = text; running = false; }
      };
      raf = requestAnimationFrame(step);
    };
    const host = el.closest("h1, h2, .card") ?? el;
    host.addEventListener("mouseenter", run);
    if (onMount) run();
    return () => { host.removeEventListener("mouseenter", run); cancelAnimationFrame(raf); };
  }, [text, onMount]);
  return <span ref={ref} className={className}>{text}</span>;
}

/* ------------------------------------------------------------------ */
/* Tiny ASCII spinner for things still in flight.                      */
/* ------------------------------------------------------------------ */
export function Spinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const id = setInterval(() => setI((n) => (n + 1) % 4), 120);
    return () => clearInterval(id);
  }, []);
  return <span className="spin" aria-hidden>{"|/-\\"[i]}</span>;
}
