import type Matter from "matter-js";
import type { BlockKind, EnemyKind } from "./types";
import { GROUND_Y, WIDTH, HEIGHT } from "./config";

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawSkyAndZones(
  ctx: CanvasRenderingContext2D,
  safeMin: number,
  safeMax: number,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#c8e8ff");
  sky.addColorStop(0.45, "#e8f4ff");
  sky.addColorStop(0.85, "#ffeef8");
  sky.addColorStop(1, "#fff5f0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, GROUND_Y);

  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.beginPath();
  ctx.ellipse(180, 110, 90, 36, 0, 0, Math.PI * 2);
  ctx.ellipse(260, 100, 70, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(920, 85, 100, 40, 0.1, 0, Math.PI * 2);
  ctx.ellipse(1020, 95, 75, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(168, 230, 185, 0.42)";
  ctx.fillRect(safeMin, 0, safeMax - safeMin, GROUND_Y);
  ctx.strokeStyle = "rgba(74, 180, 120, 0.55)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(safeMin, 0);
  ctx.lineTo(safeMin, GROUND_Y);
  ctx.moveTo(safeMax, 0);
  ctx.lineTo(safeMax, GROUND_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(255, 186, 200, 0.28)";
  ctx.fillRect(0, 0, safeMin, GROUND_Y);
  ctx.fillRect(safeMax, 0, WIDTH - safeMax, GROUND_Y);
}

export function drawGroundCasual(
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
): void {
  const w = body.bounds.max.x - body.bounds.min.x;
  const h = body.bounds.max.y - body.bounds.min.y;
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  const x = -w / 2;
  const y = -h / 2;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#8fd99a");
  g.addColorStop(0.35, "#6bc77a");
  g.addColorStop(1, "#4a9d5c");
  ctx.fillStyle = g;
  roundRectPath(ctx, x, y, w, h, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(45, 95, 58, 0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const grassY = y + 6;
  for (let i = x + 8; i < x + w - 8; i += 14) {
    ctx.moveTo(i, grassY);
    ctx.quadraticCurveTo(i + 4, grassY - 5, i + 8, grassY);
  }
  ctx.stroke();

  ctx.restore();
}

export function drawBaseCasual(
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
): void {
  const w = body.bounds.max.x - body.bounds.min.x;
  const h = body.bounds.max.y - body.bounds.min.y;
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  const x = -w / 2;
  const y = -h / 2;
  const r = 14;
  roundRectPath(ctx, x, y, w, h, r);

  const g = ctx.createRadialGradient(0, y + h * 0.35, 4, 0, 0, Math.max(w, h));
  g.addColorStop(0, "#c4d4ff");
  g.addColorStop(0.5, "#8fb4ff");
  g.addColorStop(1, "#6b8ef0");
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = "rgba(67, 97, 180, 0.75)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.15, y + h * 0.25, w * 0.22, h * 0.12, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff59d";
  ctx.font = `${Math.min(28, w * 0.38)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", 0, h * 0.08);

  ctx.restore();
}

const PUDDING_GRAD: Record<
  BlockKind,
  { light: string; mid: string; dark: string; stroke: string }
> = {
  shooter: {
    light: "#b8f5c8",
    mid: "#7ee8a0",
    dark: "#4ade80",
    stroke: "#166534",
  },
  defender: {
    light: "#fde8c8",
    mid: "#e8c49a",
    dark: "#d4a574",
    stroke: "#92400e",
  },
  producer: {
    light: "#fff9c4",
    mid: "#fde047",
    dark: "#eab308",
    stroke: "#854d0e",
  },
};

/** 在已 translate/rotate/scale 到布丁局部坐标后绘制本体（中心为 0,0） */
export function drawPuddingBodyLocal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kind: BlockKind,
): void {
  const pal = PUDDING_GRAD[kind];
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(12, w * 0.18, h * 0.22);
  roundRectPath(ctx, x, y, w, h, rr);

  const g = ctx.createRadialGradient(-w * 0.15, y + h * 0.25, 2, 0, y + h * 0.4, w * 0.85);
  g.addColorStop(0, pal.light);
  g.addColorStop(0.55, pal.mid);
  g.addColorStop(1, pal.dark);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = pal.stroke;
  ctx.lineWidth = 2.2;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.12, y + h * 0.22, w * 0.2, h * 0.14, -0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 182, 193, 0.35)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.28, y + h * 0.42, w * 0.1, h * 0.07, 0, 0, Math.PI * 2);
  ctx.ellipse(w * 0.28, y + h * 0.42, w * 0.1, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPuddingCasual(
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
  kind: BlockKind,
): void {
  const w = body.bounds.max.x - body.bounds.min.x;
  const h = body.bounds.max.y - body.bounds.min.y;
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  drawPuddingBodyLocal(ctx, w, h, kind);
  ctx.restore();
}

const ENEMY_STYLE: Record<
  EnemyKind,
  { light: string; mid: string; dark: string; stroke: string }
> = {
  runner: {
    light: "#fef9c3",
    mid: "#fde047",
    dark: "#ca8a04",
    stroke: "rgba(133, 77, 14, 0.75)",
  },
  grunt: {
    light: "#fecdd3",
    mid: "#fda4af",
    dark: "#f472b6",
    stroke: "rgba(157, 23, 77, 0.65)",
  },
  brute: {
    light: "#e9d5ff",
    mid: "#c084fc",
    dark: "#7c3aed",
    stroke: "rgba(88, 28, 135, 0.75)",
  },
  rusher: {
    light: "#fecaca",
    mid: "#f87171",
    dark: "#dc2626",
    stroke: "rgba(127, 29, 29, 0.7)",
  },
};

export function drawEnemyCasual(
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
  kind: EnemyKind,
  displayW: number,
  displayH: number,
): void {
  const w = displayW;
  const h = displayH;
  const st = ENEMY_STYLE[kind];
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(10, w * 0.2);
  roundRectPath(ctx, x, y, w, h, rr);

  const g = ctx.createRadialGradient(w * 0.1, y + h * 0.3, 2, 0, y + h * 0.35, w * 0.9);
  g.addColorStop(0, st.light);
  g.addColorStop(0.5, st.mid);
  g.addColorStop(1, st.dark);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = st.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.08, y + h * 0.28, w * 0.18, h * 0.12, -0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawHookCasual(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  const r = 14;
  const g = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r + 4);
  g.addColorStop(0, "#f5e6ff");
  g.addColorStop(0.55, "#d8b4fe");
  g.addColorStop(1, "#a78bfa");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(91, 33, 182, 0.55)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.beginPath();
  ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBulletCasual(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.shadowColor = "rgba(250, 204, 21, 0.9)";
  ctx.shadowBlur = 10;
  const g = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 8);
  g.addColorStop(0, "#fffbeb");
  g.addColorStop(0.4, "#fde047");
  g.addColorStop(1, "#f59e0b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - 1.5, y - 1.5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawRopeCasual(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  ctx.strokeStyle = "rgba(120, 113, 108, 0.75)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  ctx.moveTo(x1 + 1, y1 + 1);
  ctx.lineTo(mx + 1, my + 1);
  ctx.stroke();
}

export function drawHealthBarPill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  barW: number,
  t: number,
  mode: "friendly" | "foe",
): void {
  const h = 7;
  const y = top - 11;
  const x = cx - barW / 2;
  const r = h / 2;
  ctx.fillStyle = "rgba(30, 41, 59, 0.35)";
  roundRectPath(ctx, x, y, barW, h, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const fillW = Math.max(0, barW * t);
  if (fillW < 0.5) return;
  const g =
    mode === "friendly"
      ? (() => {
          const gr = ctx.createLinearGradient(x, y, x + fillW, y);
          gr.addColorStop(0, t > 0.35 ? "#86efac" : "#fca5a5");
          gr.addColorStop(1, t > 0.35 ? "#22c55e" : "#ef4444");
          return gr;
        })()
      : (() => {
          const gr = ctx.createLinearGradient(x, y, x + fillW, y);
          gr.addColorStop(0, "#fecaca");
          gr.addColorStop(1, "#f87171");
          return gr;
        })();
  ctx.fillStyle = g;
  roundRectPath(ctx, x, y, fillW, h, r);
  ctx.fill();
}

export function drawGameOverBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
): void {
  if (!text) return;
  ctx.save();
  const padX = 28;
  ctx.font = "600 17px system-ui, 'Segoe UI', sans-serif";
  const tw = ctx.measureText(text).width;
  const bx = 20;
  const by = HEIGHT - 52;
  const bw = tw + padX * 2;
  const bh = 36;
  const g = ctx.createLinearGradient(bx, by, bx, by + bh);
  g.addColorStop(0, "rgba(254, 226, 226, 0.95)");
  g.addColorStop(1, "rgba(252, 165, 165, 0.92)");
  ctx.fillStyle = g;
  roundRectPath(ctx, bx, by, bw, bh, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(185, 28, 28, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#7f1d1d";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx + padX, by + bh / 2);
  ctx.restore();
}
