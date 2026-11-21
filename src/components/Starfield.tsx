import { useEffect, useRef } from 'react';

interface Star { x: number; y: number; r: number; phase: number; speed: number; tint: string }
interface Meteor { x: number; y: number; dx: number; dy: number; speed: number; len: number; age: number; life: number }

const TINTS = ['255,255,255', '200,215,255', '255,225,240', '210,255,250'];

/** Full-screen twinkling starfield with occasional shooting stars. */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    const meteors: Meteor[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.round((w * h) / 3800) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() < 0.08 ? 1.2 + Math.random() * 0.8 : 0.3 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.6,
        tint: TINTS[Math.floor(Math.random() * TINTS.length)],
      }));
    };

    const spawnMeteor = () => {
      const leftward = Math.random() < 0.5;
      const angle = ((18 + Math.random() * 27) * Math.PI) / 180;
      meteors.push({
        x: leftward ? w * (0.3 + Math.random() * 0.9) : w * (-0.2 + Math.random() * 0.9),
        y: h * (-0.1 + Math.random() * 0.45),
        dx: Math.cos(angle) * (leftward ? -1 : 1),
        dy: Math.sin(angle),
        speed: 650 + Math.random() * 550,
        len: 110 + Math.random() * 170,
        age: 0,
        life: 0.9 + Math.random() * 0.8,
      });
    };

    const drawStars = (t: number) => {
      for (const s of stars) {
        const twinkle = reduceMotion ? 0.8 : 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(s.phase + (t / 1000) * s.speed));
        ctx.fillStyle = `rgba(${s.tint},${twinkle})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawMeteor = (m: Meteor) => {
      const p = m.age / m.life;
      const alpha = p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.15) / 0.85);
      const tailX = m.x - m.dx * m.len;
      const tailY = m.y - m.dy * m.len;
      const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
      grad.addColorStop(0.3, `rgba(170,190,255,${alpha * 0.5})`);
      grad.addColorStop(1, 'rgba(120,140,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 6);
      glow.addColorStop(0, `rgba(255,255,255,${alpha})`);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
      ctx.fill();
    };

    resize();
    window.addEventListener('resize', resize);

    if (reduceMotion) {
      drawStars(0);
      return () => window.removeEventListener('resize', resize);
    }

    let raf = 0;
    let last = performance.now();
    let nextMeteor = last + 600;
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      drawStars(t);
      if (t > nextMeteor) {
        spawnMeteor();
        nextMeteor = t + 700 + Math.random() * 2600;
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.age += dt;
        m.x += m.dx * m.speed * dt;
        m.y += m.dy * m.speed * dt;
        if (m.age >= m.life) meteors.splice(i, 1);
        else drawMeteor(m);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
