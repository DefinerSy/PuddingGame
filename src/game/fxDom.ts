/** DOM 层视觉反馈（飘字、飞币），覆盖在画布之上 */

import { HEIGHT, WIDTH } from "./config";

export function gameToScreen(
  canvas: HTMLCanvasElement,
  gameX: number,
  gameY: number,
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  const sx = r.width / WIDTH;
  const sy = r.height / HEIGHT;
  return {
    x: r.left + gameX * sx,
    y: r.top + gameY * sy,
  };
}

export function spawnFloatText(
  overlay: HTMLElement,
  screenX: number,
  screenY: number,
  text: string,
  className: string,
  durationMs = 1100,
): void {
  const el = document.createElement("span");
  el.className = `fx-float ${className}`;
  el.textContent = text;
  el.style.left = `${screenX}px`;
  el.style.top = `${screenY}px`;
  overlay.appendChild(el);
  window.setTimeout(() => el.remove(), durationMs + 80);
}

export function spawnFlyToElement(
  overlay: HTMLElement,
  fromX: number,
  fromY: number,
  toEl: HTMLElement,
  text: string,
  className: string,
  durationMs = 720,
): void {
  const to = toEl.getBoundingClientRect();
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  const el = document.createElement("span");
  el.className = `fx-fly ${className}`;
  el.textContent = text;
  el.style.position = "fixed";
  el.style.left = "0";
  el.style.top = "0";
  el.style.zIndex = "100";
  el.style.pointerEvents = "none";
  overlay.appendChild(el);

  const dx = tx - fromX;
  const dy = ty - fromY;
  el.animate(
    [
      {
        transform: `translate(${fromX}px, ${fromY}px) translate(-50%, -50%) scale(1.1)`,
        opacity: 1,
      },
      {
        transform: `translate(${fromX + dx * 0.45}px, ${fromY + dy * 0.35}px) translate(-50%, -50%) scale(1.05)`,
        opacity: 1,
        offset: 0.45,
      },
      {
        transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.65)`,
        opacity: 0.35,
      },
    ],
    { duration: durationMs, easing: "cubic-bezier(0.22, 0.85, 0.32, 1)" },
  ).onfinish = () => el.remove();
}

export function pulseElement(el: HTMLElement, className: string, ms = 450): void {
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), ms);
}
