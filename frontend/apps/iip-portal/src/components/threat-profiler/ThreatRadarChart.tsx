import { useEffect, useRef } from 'react';
import type { RiskScores } from '../../api/threatProfiler';

interface ThreatRadarChartProps {
  scores: RiskScores;
  animated?: boolean;
  size?: number;
}

const DIMENSIONS = [
  { key: 'violence_propensity' as const, label: 'Violence', shortLabel: 'VIO' },
  { key: 'recidivism_risk' as const, label: 'Recidivism', shortLabel: 'REC' },
  { key: 'network_influence' as const, label: 'Network', shortLabel: 'NET' },
  { key: 'flight_risk' as const, label: 'Flight Risk', shortLabel: 'FLT' },
  { key: 'radicalization_potential' as const, label: 'Radical.', shortLabel: 'RAD' },
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function getThreatColor(avgScore: number): string {
  if (avgScore >= 75) return '#ff2d55';
  if (avgScore >= 50) return '#ff9500';
  if (avgScore >= 25) return '#ffcc00';
  return '#30d158';
}

export function ThreatRadarChart({ scores, animated = true, size = 280 }: ThreatRadarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.36;
    const rings = 5;
    const dims = DIMENSIONS.length;
    const angleStep = 360 / dims;

    const values = DIMENSIONS.map((d) => scores[d.key]);
    const avgScore = values.reduce((a, b) => a + b, 0) / values.length;
    const color = getThreatColor(avgScore);

    // Theme-based colors for canvas readability
    const isDark = document.documentElement.classList.contains('dark');
    const ringColor = isDark ? 'rgba(0, 200, 255, 0.08)' : 'rgba(70, 95, 255, 0.08)';
    const outerRingColor = isDark ? 'rgba(0, 200, 255, 0.25)' : 'rgba(70, 95, 255, 0.25)';
    const axisColor = isDark ? 'rgba(0, 200, 255, 0.12)' : 'rgba(70, 95, 255, 0.12)';
    const labelColor = isDark ? 'rgba(180, 220, 255, 0.9)' : 'rgba(71, 85, 105, 0.95)';
    const centerSubtextColor = isDark ? 'rgba(180, 220, 255, 0.6)' : 'rgba(100, 116, 139, 0.75)';

    function draw(progress: number) {
      ctx!.clearRect(0, 0, size, size);

      // Draw grid rings
      for (let i = 1; i <= rings; i++) {
        const r = (maxR / rings) * i;
        ctx!.beginPath();
        for (let j = 0; j <= dims; j++) {
          const angle = angleStep * j;
          const { x, y } = polarToCartesian(cx, cy, r, angle);
          if (j === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.closePath();
        ctx!.strokeStyle = i === rings ? outerRingColor : ringColor;
        ctx!.lineWidth = i === rings ? 1.5 : 0.7;
        ctx!.stroke();
      }

      // Draw axis lines
      for (let i = 0; i < dims; i++) {
        const angle = angleStep * i;
        const { x, y } = polarToCartesian(cx, cy, maxR, angle);
        ctx!.beginPath();
        ctx!.moveTo(cx, cy);
        ctx!.lineTo(x, y);
        ctx!.strokeStyle = axisColor;
        ctx!.lineWidth = 0.7;
        ctx!.stroke();
      }

      // Draw value polygon with animation
      const p = Math.min(progress, 1);
      ctx!.beginPath();
      for (let i = 0; i <= dims; i++) {
        const idx = i % dims;
        const val = (values[idx] / 100) * maxR * p;
        const angle = angleStep * idx;
        const { x, y } = polarToCartesian(cx, cy, val, angle);
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.closePath();

      // Gradient fill
      const gradient = ctx!.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      gradient.addColorStop(0, `${color}44`);
      gradient.addColorStop(1, `${color}11`);
      ctx!.fillStyle = gradient;
      ctx!.fill();

      // Glow stroke
      ctx!.strokeStyle = color;
      ctx!.lineWidth = 2;
      ctx!.shadowColor = color;
      ctx!.shadowBlur = 12 * p;
      ctx!.stroke();
      ctx!.shadowBlur = 0;

      // Draw value dots
      for (let i = 0; i < dims; i++) {
        const val = (values[i] / 100) * maxR * p;
        const angle = angleStep * i;
        const { x, y } = polarToCartesian(cx, cy, val, angle);

        ctx!.beginPath();
        ctx!.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx!.fillStyle = color;
        ctx!.shadowColor = color;
        ctx!.shadowBlur = 8;
        ctx!.fill();
        ctx!.shadowBlur = 0;

        // White ring
        ctx!.beginPath();
        ctx!.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx!.strokeStyle = '#fff';
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      // Draw labels
      for (let i = 0; i < dims; i++) {
        const angle = angleStep * i;
        const labelR = maxR + 22;
        const { x, y } = polarToCartesian(cx, cy, labelR, angle);

        ctx!.font = '600 10px Inter, system-ui, sans-serif';
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillStyle = labelColor;
        ctx!.fillText(DIMENSIONS[i].label, x, y - 6);

        // Score value
        ctx!.font = '700 12px Inter, system-ui, sans-serif';
        ctx!.fillStyle = color;
        ctx!.fillText(`${Math.round(values[i] * p)}`, x, y + 8);
      }

      // Center threat score
      ctx!.font = '800 28px Inter, system-ui, sans-serif';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillStyle = color;
      ctx!.shadowColor = color;
      ctx!.shadowBlur = 20;
      ctx!.fillText(`${Math.round(avgScore * p)}`, cx, cy - 4);
      ctx!.shadowBlur = 0;

      ctx!.font = '600 9px Inter, system-ui, sans-serif';
      ctx!.fillStyle = centerSubtextColor;
      ctx!.fillText('THREAT INDEX', cx, cy + 14);
    }

    if (animated) {
      progressRef.current = 0;
      const startTime = performance.now();
      const duration = 1200;

      function animate(now: number) {
        const elapsed = now - startTime;
        progressRef.current = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const t = progressRef.current;
        const eased = 1 - Math.pow(1 - t, 3);
        draw(eased);
        if (progressRef.current < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    } else {
      draw(1);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scores, animated, size]);

  return (
    <div className="tp-radar-container">
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="tp-radar-canvas"
      />
    </div>
  );
}
