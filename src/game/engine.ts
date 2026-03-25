import Matter from "matter-js";
import {
  BASE_MAX_HP,
  CRANE_HOOK_Y,
  CRANE_MOVE_SPEED,
  CRANE_X_MAX,
  CRANE_X_MIN,
  DEFENDER_HP,
  ENEMIES_PER_SIDE_BASE,
  ENEMY_DAMAGE,
  ENEMY_HP,
  ENEMY_SPEED,
  GROUND_THICK,
  GROUND_Y,
  HEIGHT,
  PRODUCER_AMOUNT,
  PRODUCER_INTERVAL_MS,
  REFRESH_COST,
  ROLL_COST,
  SAFE_HALF_WIDTH,
  SHOOT_INTERVAL_MS,
  SHOOT_RANGE_BASE,
  SHOOT_RANGE_PER_HEIGHT,
  START_MONEY,
  TAKE_COST,
  WAVE_INTERVAL_MS,
  WIDTH,
} from "./config";
import type { BlockKind, EnemyData, PuddingData } from "./types";

const { Engine, Bodies, Body, Events, Composite, Constraint, Runner } = Matter;

const CAT_GROUND = 0x0001;
const CAT_BLOCK = 0x0002;
const CAT_ENEMY = 0x0004;
const CAT_BULLET = 0x0008;
const CAT_BASE = 0x0010;
const CAT_HOOK = 0x0020;

const LABEL_GROUND = "ground";
const LABEL_PUDDING = "pudding";
const LABEL_ENEMY = "enemy";
const LABEL_BULLET = "bullet";
const LABEL_BASE = "base";
const LABEL_HOOK = "hook";

function randomKind(): BlockKind {
  const r = Math.random();
  if (r < 0.35) return "shooter";
  if (r < 0.65) return "defender";
  return "producer";
}

function kindLabel(k: BlockKind): string {
  switch (k) {
    case "shooter":
      return "射手布丁";
    case "defender":
      return "防御者布丁";
    case "producer":
      return "生产者布丁";
  }
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private engine: Matter.Engine;
  private runner: Matter.Runner;
  private world: Matter.World;

  private craneX = WIDTH / 2;
  private keys = new Set<string>();
  private touchLeftHeld = false;
  private touchRightHeld = false;
  private dragPointerId: number | null = null;
  private dragStartGameX = 0;
  private dragStartCraneX = 0;
  private grabConstraint: Matter.Constraint | null = null;
  private heldBody: Matter.Body | null = null;

  private money = START_MONEY;
  private baseHp = BASE_MAX_HP;
  private wave = 0;
  private waveTimer = WAVE_INTERVAL_MS - 4000;
  private gameOver = false;

  private shopSlots: BlockKind[] = [];
  private shopFilled = false;

  private enemyHitBaseCooldown = new Map<number, number>();

  private moneyEl = document.getElementById("money")!;
  private waveEl = document.getElementById("wave")!;
  private baseHpEl = document.getElementById("base-hp")!;
  private btnRoll = document.getElementById("btn-roll") as HTMLButtonElement;
  private btnRefresh = document.getElementById("btn-refresh") as HTMLButtonElement;
  private rollCostEl = document.getElementById("roll-cost")!;
  private refreshCostEl = document.getElementById("refresh-cost")!;
  private slotsEl = document.getElementById("slots")!;
  private btnLeft = document.getElementById("btn-left") as HTMLButtonElement | null;
  private btnRight = document.getElementById("btn-right") as HTMLButtonElement | null;
  private btnGrab = document.getElementById("btn-grab") as HTMLButtonElement | null;

  private ground!: Matter.Body;
  private hook!: Matter.Body;
  private baseBody!: Matter.Body;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context");
    this.ctx = ctx;

    this.engine = Engine.create({ enableSleeping: true });
    this.world = this.engine.world;
    this.engine.gravity.y = 1;

    this.ground = Bodies.rectangle(
      WIDTH / 2,
      GROUND_Y + GROUND_THICK / 2,
      WIDTH + 200,
      GROUND_THICK,
      {
        isStatic: true,
        label: LABEL_GROUND,
        friction: 0.85,
        frictionStatic: 1,
        collisionFilter: {
          category: CAT_GROUND,
          mask: CAT_BLOCK | CAT_ENEMY,
        },
      },
    );

    this.hook = Bodies.circle(this.craneX, CRANE_HOOK_Y, 12, {
      isStatic: true,
      label: LABEL_HOOK,
      collisionFilter: { category: CAT_HOOK, mask: 0 },
    });

    this.baseBody = Bodies.rectangle(WIDTH / 2, GROUND_Y - 36, 72, 72, {
      isStatic: true,
      isSensor: true,
      label: LABEL_BASE,
      collisionFilter: { category: CAT_BASE, mask: CAT_ENEMY },
    });

    Composite.add(this.world, [this.ground, this.hook, this.baseBody]);

    this.runner = Runner.create();
    Runner.run(this.runner, this.engine);

    this.bindInput();
    this.bindShop();
    this.bindCollisions();

    Events.on(this.engine, "beforeUpdate", () => this.onBeforeUpdate());
  }

  start(): void {
    this.loop();
    this.renderShop();
    this.updateHud();
  }

  private bindInput(): void {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        this.toggleGrab();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    this.bindCanvasPointer();
    this.bindTouchButtons();
  }

  private clientToGameX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    return (clientX - rect.left) * scaleX;
  }

  private bindCanvasPointer(): void {
    const onDown = (e: PointerEvent) => {
      if (this.gameOver) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (this.dragPointerId !== null) return;
      e.preventDefault();
      this.dragPointerId = e.pointerId;
      this.dragStartGameX = this.clientToGameX(e.clientX);
      this.dragStartCraneX = this.craneX;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== this.dragPointerId) return;
      e.preventDefault();
      const gx = this.clientToGameX(e.clientX);
      const next = this.dragStartCraneX + (gx - this.dragStartGameX);
      this.craneX = Math.min(
        CRANE_X_MAX,
        Math.max(CRANE_X_MIN, next),
      );
      Body.setPosition(this.hook, { x: this.craneX, y: CRANE_HOOK_Y });
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== this.dragPointerId) return;
      this.dragPointerId = null;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    this.canvas.addEventListener("pointerdown", onDown, { passive: false });
    this.canvas.addEventListener("pointermove", onMove, { passive: false });
    this.canvas.addEventListener("pointerup", onUp);
    this.canvas.addEventListener("pointercancel", onUp);
  }

  private bindTouchButtons(): void {
    const holdLeft = (down: boolean) => {
      this.touchLeftHeld = down;
    };
    const holdRight = (down: boolean) => {
      this.touchRightHeld = down;
    };

    const bindHold = (
      el: HTMLButtonElement | null,
      setHeld: (v: boolean) => void,
    ) => {
      if (!el) return;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        setHeld(true);
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      });
      el.addEventListener("pointerup", () => setHeld(false));
      el.addEventListener("pointercancel", () => setHeld(false));
      el.addEventListener("lostpointercapture", () => setHeld(false));
    };

    bindHold(this.btnLeft, holdLeft);
    bindHold(this.btnRight, holdRight);

    this.btnGrab?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.gameOver) return;
      this.toggleGrab();
      this.renderShop();
    });
  }

  private bindShop(): void {
    this.btnRoll.addEventListener("click", () => this.rollShop());
    this.btnRefresh.addEventListener("click", () => this.refreshShop());
  }

  private bindCollisions(): void {
    Events.on(this.engine, "collisionStart", (ev: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of ev.pairs) {
        const { bodyA, bodyB } = pair;
        this.handleGroundLanding(bodyA, bodyB);
        this.handleBulletHit(bodyA, bodyB);
      }
    });

    Events.on(this.engine, "collisionActive", (ev: Matter.IEventCollision<Matter.Engine>) => {
      const now = performance.now();
      for (const pair of ev.pairs) {
        this.handleEnemyBase(pair.bodyA, pair.bodyB, now);
      }
    });
  }

  private handleGroundLanding(a: Matter.Body, b: Matter.Body): void {
    const g = a.label === LABEL_GROUND ? a : b.label === LABEL_GROUND ? b : null;
    const p =
      a.label === LABEL_PUDDING ? a : b.label === LABEL_PUDDING ? b : null;
    if (!g || !p) return;

    const minX = this.craneX - SAFE_HALF_WIDTH;
    const maxX = this.craneX + SAFE_HALF_WIDTH;
    if (p.position.x < minX || p.position.x > maxX) {
      if (this.grabConstraint?.bodyB === p) {
        this.releaseGrab();
        this.renderShop();
      }
      Composite.remove(this.world, p);
    }
  }

  private handleBulletHit(a: Matter.Body, b: Matter.Body): void {
    const bullet =
      a.label === LABEL_BULLET ? a : b.label === LABEL_BULLET ? b : null;
    const enemy =
      a.label === LABEL_ENEMY ? a : b.label === LABEL_ENEMY ? b : null;
    if (!bullet || !enemy) return;

    Composite.remove(this.world, bullet);
    const data = enemy.plugin.puddingEnemy as EnemyData | undefined;
    if (!data) return;
    const dmg = (bullet.plugin.bulletDmg as number) ?? 12;
    data.hp -= dmg;
    if (data.hp <= 0) {
      Composite.remove(this.world, enemy);
    }
  }

  private handleEnemyBase(
    a: Matter.Body,
    b: Matter.Body,
    now: number,
  ): void {
    const enemy =
      a.label === LABEL_ENEMY ? a : b.label === LABEL_ENEMY ? b : null;
    const base =
      a.label === LABEL_BASE ? a : b.label === LABEL_BASE ? b : null;
    if (!enemy || !base || this.gameOver) return;

    const id = enemy.id;
    const last = this.enemyHitBaseCooldown.get(id) ?? 0;
    if (now - last < 500) return;
    this.enemyHitBaseCooldown.set(id, now);
    this.baseHp -= ENEMY_DAMAGE;
    if (this.baseHp <= 0) {
      this.baseHp = 0;
      this.gameOver = true;
    }
    this.updateHud();
  }

  private onBeforeUpdate(): void {
    if (this.gameOver) return;

    let dx = 0;
    if (
      this.keys.has("KeyA") ||
      this.keys.has("ArrowLeft")
    ) {
      dx -= CRANE_MOVE_SPEED;
    }
    if (
      this.keys.has("KeyD") ||
      this.keys.has("ArrowRight")
    ) {
      dx += CRANE_MOVE_SPEED;
    }
    if (this.touchLeftHeld) {
      dx -= CRANE_MOVE_SPEED;
    }
    if (this.touchRightHeld) {
      dx += CRANE_MOVE_SPEED;
    }
    this.craneX = Math.min(
      CRANE_X_MAX,
      Math.max(CRANE_X_MIN, this.craneX + dx),
    );
    Body.setPosition(this.hook, { x: this.craneX, y: CRANE_HOOK_Y });

    const dt = 1000 / 60;
    this.tickPuddings(dt);
    this.tickEnemies();
    this.tickWaves(dt);
    this.tickBullets();
  }

  private tickPuddings(dt: number): void {
    const bodies = Composite.allBodies(this.world);
    for (const body of bodies) {
      if (body.label !== LABEL_PUDDING) continue;
      const data = body.plugin.pudding as PuddingData | undefined;
      if (!data) continue;

      if (data.kind === "producer") {
        data.produceAccumulator += dt;
        if (data.produceAccumulator >= PRODUCER_INTERVAL_MS) {
          data.produceAccumulator = 0;
          this.money += PRODUCER_AMOUNT;
          this.updateHud();
        }
      }

      if (data.kind === "shooter") {
        data.shootAccumulator += dt;
        if (data.shootAccumulator >= SHOOT_INTERVAL_MS) {
          data.shootAccumulator = 0;
          this.tryShoot(body, data);
        }
      }
    }
  }

  private heightBonus(body: Matter.Body): number {
    const top = GROUND_Y - body.bounds.max.y;
    return Math.max(0, top);
  }

  private tryShoot(body: Matter.Body, _data: PuddingData): void {
    const range =
      SHOOT_RANGE_BASE + this.heightBonus(body) * SHOOT_RANGE_PER_HEIGHT;
    let best: Matter.Body | null = null;
    let bestD = range + 1;
    const bodies = Composite.allBodies(this.world);
    for (const other of bodies) {
      if (other.label !== LABEL_ENEMY) continue;
      const d = Matter.Vector.magnitude(
        Matter.Vector.sub(other.position, body.position),
      );
      if (d <= range && d < bestD) {
        bestD = d;
        best = other;
      }
    }
    if (!best) return;

    const dir = Matter.Vector.normalise(
      Matter.Vector.sub(best.position, body.position),
    );
    const bullet = Bodies.circle(
      body.position.x + dir.x * 28,
      body.position.y + dir.y * 28,
      6,
      {
        label: LABEL_BULLET,
        frictionAir: 0,
        restitution: 0,
        density: 0.001,
        collisionFilter: {
          category: CAT_BULLET,
          mask: CAT_ENEMY,
        },
      },
    );
    bullet.plugin.bulletDmg = 14;
    Body.setVelocity(bullet, {
      x: dir.x * 12,
      y: dir.y * 12,
    });
    bullet.plugin.lifeMs = 2200;
    Composite.add(this.world, bullet);
  }

  private tickEnemies(): void {
    const targetX = WIDTH / 2;
    const bodies = Composite.allBodies(this.world);
    for (const body of bodies) {
      if (body.label !== LABEL_ENEMY) continue;
      const toward = targetX - body.position.x;
      const sign = toward === 0 ? 0 : toward > 0 ? 1 : -1;
      Body.setVelocity(body, { x: sign * ENEMY_SPEED, y: body.velocity.y });
    }
  }

  private tickWaves(dt: number): void {
    this.waveTimer += dt;
    if (this.waveTimer < WAVE_INTERVAL_MS) return;
    this.waveTimer = 0;
    this.wave += 1;
    const n = ENEMIES_PER_SIDE_BASE + Math.floor(this.wave / 3);
    for (let i = 0; i < n; i++) {
      this.spawnEnemy(40 + i * 18, true);
      this.spawnEnemy(WIDTH - 40 - i * 18, false);
    }
    this.updateHud();
  }

  private spawnEnemy(x: number, fromLeft: boolean): void {
    const body = Bodies.rectangle(x, GROUND_Y - 50, 34, 40, {
      label: LABEL_ENEMY,
      frictionAir: 0.02,
      collisionFilter: {
        category: CAT_ENEMY,
        mask: CAT_GROUND | CAT_BLOCK | CAT_BASE | CAT_BULLET,
      },
    });
    body.plugin.puddingEnemy = { hp: ENEMY_HP } satisfies EnemyData;
    Body.setVelocity(body, { x: fromLeft ? ENEMY_SPEED : -ENEMY_SPEED, y: 0 });
    Composite.add(this.world, body);
  }

  private tickBullets(): void {
    const dt = 1000 / 60;
    const bodies = Composite.allBodies(this.world);
    for (const body of bodies) {
      if (body.label !== LABEL_BULLET) continue;
      const life = (body.plugin.lifeMs as number) ?? 0;
      body.plugin.lifeMs = life - dt;
      if ((body.plugin.lifeMs as number) <= 0) {
        Composite.remove(this.world, body);
      }
    }
  }

  private toggleGrab(): void {
    if (this.gameOver) return;
    if (this.grabConstraint) {
      this.releaseGrab();
      this.renderShop();
      return;
    }
    const bodies = Composite.allBodies(this.world);
    let best: Matter.Body | null = null;
    let bestDist = 96;
    for (const body of bodies) {
      if (body.label !== LABEL_PUDDING) continue;
      const d = Matter.Vector.magnitude(
        Matter.Vector.sub(body.position, this.hook.position),
      );
      if (d < bestDist) {
        bestDist = d;
        best = body;
      }
    }
    if (!best) return;

    this.heldBody = best;
    Body.setAngularVelocity(best, 0);
    this.grabConstraint = Constraint.create({
      bodyA: this.hook,
      bodyB: best,
      stiffness: 0.9,
      damping: 0.08,
      length: Math.max(
        40,
        Matter.Vector.magnitude(
          Matter.Vector.sub(best.position, this.hook.position),
        ),
      ),
    });
    Composite.add(this.world, this.grabConstraint);
  }

  private releaseGrab(): void {
    if (this.grabConstraint) {
      Composite.remove(this.world, this.grabConstraint);
      this.grabConstraint = null;
    }
    this.heldBody = null;
  }

  private rollShop(): void {
    if (this.gameOver) return;
    if (this.money < ROLL_COST) return;
    this.money -= ROLL_COST;
    this.shopSlots = [randomKind(), randomKind(), randomKind()];
    this.shopFilled = true;
    this.updateHud();
    this.renderShop();
  }

  private refreshShop(): void {
    if (this.gameOver) return;
    if (!this.shopFilled) return;
    if (this.money < REFRESH_COST) return;
    this.money -= REFRESH_COST;
    this.shopSlots = [randomKind(), randomKind(), randomKind()];
    this.updateHud();
    this.renderShop();
  }

  private takeFromSlot(index: number): void {
    if (this.gameOver) return;
    if (!this.shopFilled || index < 0 || index >= this.shopSlots.length) {
      return;
    }
    if (this.money < TAKE_COST) return;
    if (this.heldBody) return;

    this.money -= TAKE_COST;
    const kind = this.shopSlots[index]!;
    this.shopSlots.splice(index, 1);
    if (this.shopSlots.length === 0) {
      this.shopFilled = false;
    }

    const body = this.createPuddingBody(kind, this.craneX, CRANE_HOOK_Y + 120);
    Composite.add(this.world, body);
    this.heldBody = body;
    this.grabConstraint = Constraint.create({
      bodyA: this.hook,
      bodyB: body,
      stiffness: 0.85,
      damping: 0.06,
      length: 100,
    });
    Composite.add(this.world, this.grabConstraint);

    this.updateHud();
    this.renderShop();
  }

  private createPuddingBody(kind: BlockKind, x: number, y: number): Matter.Body {
    let w = 48;
    let h = 40;
    let maxHp = 60;
    if (kind === "defender") {
      w = 58;
      h = 46;
      maxHp = DEFENDER_HP;
    }
    if (kind === "producer") {
      w = 46;
      h = 42;
      maxHp = 70;
    }

    const body = Bodies.rectangle(x, y, w, h, {
      chamfer: { radius: 6 },
      label: LABEL_PUDDING,
      friction: 0.75,
      frictionStatic: 0.9,
      density: kind === "defender" ? 0.008 : 0.004,
      collisionFilter: {
        category: CAT_BLOCK,
        mask: CAT_GROUND | CAT_ENEMY | CAT_BLOCK,
      },
    });

    const data: PuddingData = {
      kind,
      hp: maxHp,
      maxHp,
      shootAccumulator: 0,
      produceAccumulator: 0,
    };
    body.plugin.pudding = data;
    body.plugin.puddingKind = kind;
    return body;
  }

  private updateHud(): void {
    this.moneyEl.textContent = `费用: ${this.money}`;
    this.waveEl.textContent = `波次: ${this.wave}`;
    this.baseHpEl.textContent = `基地: ${Math.ceil(this.baseHp)}${
      this.gameOver ? " (失败)" : ""
    }`;
    this.rollCostEl.textContent = `消耗 ${ROLL_COST}`;
    this.refreshCostEl.textContent = `消耗 ${REFRESH_COST}`;
    this.btnRoll.disabled = this.gameOver || this.money < ROLL_COST;
    this.btnRefresh.disabled =
      this.gameOver || !this.shopFilled || this.money < REFRESH_COST;
  }

  private renderShop(): void {
    this.slotsEl.innerHTML = "";
    if (!this.shopFilled) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "先支付费用进行 Roll，再从三格中取货（每格另付费用）。";
      this.slotsEl.appendChild(p);
      return;
    }
    this.shopSlots.forEach((kind, index) => {
      const div = document.createElement("div");
      div.className = "slot";
      const title = document.createElement("div");
      title.className = `slot-type ${kind}`;
      title.textContent = kindLabel(kind);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `取出 (${TAKE_COST})`;
      btn.disabled =
        this.gameOver || this.money < TAKE_COST || !!this.grabConstraint;
      btn.addEventListener("click", () => this.takeFromSlot(index));
      div.appendChild(title);
      div.appendChild(btn);
      this.slotsEl.appendChild(div);
    });
  }

  private loop = (): void => {
    this.draw();
    requestAnimationFrame(this.loop);
  };

  private draw(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#0f1116";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const safeMin = this.craneX - SAFE_HALF_WIDTH;
    const safeMax = this.craneX + SAFE_HALF_WIDTH;
    ctx.fillStyle = "rgba(80, 200, 120, 0.18)";
    ctx.fillRect(safeMin, 0, safeMax - safeMin, GROUND_Y);

    ctx.fillStyle = "rgba(200, 80, 80, 0.12)";
    ctx.fillRect(0, 0, safeMin, GROUND_Y);
    ctx.fillRect(safeMax, 0, WIDTH - safeMax, GROUND_Y);

    ctx.strokeStyle = "#4a5568";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(safeMin, 0);
    ctx.lineTo(safeMin, GROUND_Y);
    ctx.moveTo(safeMax, 0);
    ctx.lineTo(safeMax, GROUND_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    const bodies = Composite.allBodies(this.world);
    for (const body of bodies) {
      if (body.label === LABEL_HOOK) {
        ctx.fillStyle = "#a78bfa";
        ctx.beginPath();
        ctx.arc(body.position.x, body.position.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#c4b5fd";
        ctx.lineWidth = 2;
        ctx.stroke();
        continue;
      }
      if (body.label === LABEL_BASE) {
        ctx.fillStyle = "rgba(100, 149, 237, 0.35)";
        ctx.strokeStyle = "#6495ed";
        this.drawBodyRect(ctx, body);
        continue;
      }
      if (body.label === LABEL_GROUND) {
        ctx.fillStyle = "#2d3344";
        this.drawBodyRect(ctx, body);
        continue;
      }
      if (body.label === LABEL_PUDDING) {
        const kind = body.plugin.puddingKind as BlockKind;
        ctx.fillStyle =
          kind === "shooter"
            ? "#4ade80"
            : kind === "defender"
              ? "#d4a574"
              : "#fde047";
        ctx.strokeStyle = "#1e293b";
        this.drawBodyRect(ctx, body);
        const data = body.plugin.pudding as PuddingData | undefined;
        if (data && data.kind === "defender" && data.hp < data.maxHp) {
          const t = data.hp / data.maxHp;
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(
            body.position.x - 24,
            body.position.y - 36,
            48 * t,
            4,
          );
        }
        continue;
      }
      if (body.label === LABEL_ENEMY) {
        ctx.fillStyle = "#f87171";
        ctx.strokeStyle = "#7f1d1d";
        this.drawBodyRect(ctx, body);
        const ed = body.plugin.puddingEnemy as EnemyData | undefined;
        if (ed) {
          const t = ed.hp / ENEMY_HP;
          ctx.fillStyle = "#fca5a5";
          ctx.fillRect(body.position.x - 18, body.position.y - 28, 36 * t, 3);
        }
        continue;
      }
      if (body.label === LABEL_BULLET) {
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.arc(body.position.x, body.position.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.grabConstraint) {
      const other = this.grabConstraint.bodyB;
      if (other) {
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.hook.position.x, this.hook.position.y);
        ctx.lineTo(other.position.x, other.position.y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "14px system-ui";
    ctx.fillText(
      this.gameOver ? "基地被攻破 — 刷新页面重开" : "",
      24,
      HEIGHT - 20,
    );
  }

  private drawBodyRect(
    ctx: CanvasRenderingContext2D,
    body: Matter.Body,
  ): void {
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    const w = body.bounds.max.x - body.bounds.min.x;
    const h = body.bounds.max.y - body.bounds.min.y;
    const x = -w / 2;
    const y = -h / 2;
    const r = 6;
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
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}
