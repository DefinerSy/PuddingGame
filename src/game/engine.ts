import Matter from "matter-js";
import {
  BASE_MAX_HP,
  CRANE_HOOK_Y,
  CRANE_MOVE_SPEED,
  CRANE_X_MAX,
  CRANE_X_MIN,
  DEFENDER_HP,
  ENEMIES_COUNT_SCALE_EVERY,
  ENEMIES_PER_SIDE_BASE,
  ENEMY_DAMAGE,
  ENEMY_DAMAGE_TO_PUDDING,
  ENEMY_HP,
  ENEMY_HP_WAVE_MULT,
  ENEMY_SPEED,
  ENEMY_EYE_PUDDING_RANGE,
  EYE_BLINK_DURATION_MS,
  EYE_BLINK_GAP_MAX_MS,
  EYE_BLINK_GAP_MIN_MS,
  GROUND_THICK,
  GROUND_Y,
  PRODUCER_AMOUNT,
  PRODUCER_INTERVAL_MS,
  ROLL_COST,
  SAFE_HALF_WIDTH,
  SHOOT_INTERVAL_MS,
  SHOOT_RANGE_BASE,
  SHOOT_RANGE_PER_HEIGHT,
  SHOOTER_HP,
  BULLET_DAMAGE,
  PASSIVE_INCOME_PER_MINUTE,
  PRODUCER_BLOCK_HP,
  PUDDING_EYE_ENEMY_RANGE,
  PUDDING_HELD_SWAY_AMP,
  PUDDING_IDLE_WOBBLE_AMP,
  PUDDING_IDLE_WOBBLE_SPEED,
  PUDDING_JIGGLE_DAMPING,
  PUDDING_JIGGLE_IMPACT_THRESHOLD,
  PUDDING_JIGGLE_IMPULSE_CAP,
  PUDDING_JIGGLE_SPRING,
  PUDDING_EYE_NEIGHBOR_RANGE,
  START_MONEY,
  TAKE_COST,
  WAVE_INTERVAL_MS,
  WAVE_START_DELAY_MS,
  WIDTH,
} from "./config";
import type { BlockKind, EnemyData, PuddingData } from "./types";
import {
  drawBaseCasual,
  drawBulletCasual,
  drawEnemyCasual,
  drawGroundCasual,
  drawHealthBarPill,
  drawHookCasual,
  drawPuddingBodyLocal,
  drawRopeCasual,
  drawSkyAndZones,
} from "./canvasArt";
import {
  gameToScreen,
  pulseElement,
  spawnFloatText,
  spawnFlyToElement,
} from "./fxDom";

const { Engine, Bodies, Body, Events, Composite, Constraint, Runner } = Matter;

interface DefeatParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  color: string;
}

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

function clampMag(v: Matter.Vector, maxLen: number): Matter.Vector {
  const m = Matter.Vector.magnitude(v);
  if (m <= maxLen || m < 1e-6) return v;
  const s = maxLen / m;
  return { x: v.x * s, y: v.y * s };
}

interface EyeBlinkState {
  /** 下一次开始眨眼的时间戳 */
  nextAt: number;
  /** >0 且 now < blinkUntil 时为闭眼动画中 */
  blinkUntil: number;
}

function randomBlinkGap(): number {
  return (
    EYE_BLINK_GAP_MIN_MS +
    Math.random() * (EYE_BLINK_GAP_MAX_MS - EYE_BLINK_GAP_MIN_MS)
  );
}

function initEyeBlink(body: Matter.Body, now: number): void {
  if (body.plugin.eyeBlink) return;
  body.plugin.eyeBlink = {
    nextAt: now + randomBlinkGap() * (0.4 + Math.random() * 0.6),
    blinkUntil: 0,
  } satisfies EyeBlinkState;
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
  private passiveIncomeFrac = 0;
  private baseHp = BASE_MAX_HP;
  private wave = 0;
  private waveTimer = WAVE_INTERVAL_MS - WAVE_START_DELAY_MS;
  private gameOver = false;
  private defeatFxTriggered = false;
  private defeatParticles: DefeatParticle[] = [];
  private lastDrawTime = performance.now();

  private shopSlots: BlockKind[] = [];
  private shopFilled = false;

  private enemyHitBaseCooldown = new Map<number, number>();
  private enemyHitPuddingCooldown = new Map<string, number>();

  private moneyEl = document.getElementById("money")!;
  private waveEl = document.getElementById("wave")!;
  private baseHpEl = document.getElementById("base-hp")!;
  private btnRoll = document.getElementById("btn-roll") as HTMLButtonElement;
  private rollCostEl = document.getElementById("roll-cost")!;
  private slotsEl = document.getElementById("slots")!;
  private btnLeft = document.getElementById("btn-left") as HTMLButtonElement | null;
  private btnRight = document.getElementById("btn-right") as HTMLButtonElement | null;
  private btnGrab = document.getElementById("btn-grab") as HTMLButtonElement | null;
  private fxOverlay =
    document.getElementById("fx-overlay") ?? document.body;
  private gameOverVeil = document.getElementById(
    "game-over-veil",
  ) as HTMLElement | null;
  private statCoinsPill = document.querySelector(
    ".stat-pill.stat-coins",
  ) as HTMLElement;

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
      label: LABEL_BASE,
      friction: 0.88,
      frictionStatic: 1,
      collisionFilter: {
        category: CAT_BASE,
        mask: CAT_ENEMY | CAT_BLOCK,
      },
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
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }

      this.keys.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        this.toggleGrab();
        return;
      }

      if (e.repeat) return;

      if (e.code === "KeyR") {
        e.preventDefault();
        this.rollShop();
        return;
      }
      if (e.code === "Digit1") {
        e.preventDefault();
        this.takeFromSlot(0);
        return;
      }
      if (e.code === "Digit2") {
        e.preventDefault();
        this.takeFromSlot(1);
        return;
      }
      if (e.code === "Digit3") {
        e.preventDefault();
        this.takeFromSlot(2);
        return;
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
    });
  }

  private bindShop(): void {
    this.btnRoll.addEventListener("click", () => this.rollShop());
  }

  private bindCollisions(): void {
    Events.on(this.engine, "collisionStart", (ev: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of ev.pairs) {
        const { bodyA, bodyB } = pair;
        this.handleSupportLanding(bodyA, bodyB);
        this.handleBulletHit(bodyA, bodyB);
        this.applyPuddingJiggleFromPair(pair);
      }
    });

    Events.on(this.engine, "collisionActive", (ev: Matter.IEventCollision<Matter.Engine>) => {
      const now = performance.now();
      for (const pair of ev.pairs) {
        this.handleEnemyBase(pair.bodyA, pair.bodyB, now);
        this.handleEnemyPudding(pair.bodyA, pair.bodyB, now);
      }
    });

    Events.on(this.engine, "collisionEnd", (ev: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of ev.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;
        const enemy =
          a.label === LABEL_ENEMY ? a : b.label === LABEL_ENEMY ? b : null;
        const pud =
          a.label === LABEL_PUDDING ? a : b.label === LABEL_PUDDING ? b : null;
        if (enemy && pud) {
          this.enemyHitPuddingCooldown.delete(`${enemy.id}-${pud.id}`);
        }
      }
    });
  }

  /** 布丁落在地面时需落在吊机安全区；落在核心上任意位置均可搭建 */
  private applyPuddingJiggleFromPair(pair: Matter.Pair): void {
    const col = pair.collision;
    if (!col?.collided) return;
    const a = pair.bodyA;
    const b = pair.bodyB;
    const n = col.normal;
    const rel = Matter.Vector.sub(b.velocity, a.velocity);
    const approach = Math.abs(Matter.Vector.dot(rel, n));
    if (approach < PUDDING_JIGGLE_IMPACT_THRESHOLD) return;
    const impulse = Math.min(
      PUDDING_JIGGLE_IMPULSE_CAP,
      approach * 0.55,
    );
    for (const body of [a, b]) {
      if (body.label !== LABEL_PUDDING) continue;
      const data = body.plugin.pudding as PuddingData | undefined;
      if (!data) continue;
      data.jiggleV += impulse;
    }
  }

  private tickPuddingJiggle(dt: number): void {
    const dtSec = dt / 1000;
    const bodies = Composite.allBodies(this.world);
    for (const body of bodies) {
      if (body.label !== LABEL_PUDDING) continue;
      const data = body.plugin.pudding as PuddingData | undefined;
      if (!data) continue;
      if (data.jiggleX === undefined) {
        data.jiggleX = 0;
        data.jiggleV = 0;
        data.idlePhase = Math.random() * Math.PI * 2;
      }
      const k = PUDDING_JIGGLE_SPRING;
      const d = PUDDING_JIGGLE_DAMPING;
      data.jiggleV += (-k * data.jiggleX - d * data.jiggleV) * dtSec;
      data.jiggleX += data.jiggleV * dtSec;

      const spd = Matter.Vector.magnitude(body.velocity);
      const av = Math.abs(body.angularVelocity);
      if (spd < 0.18 && av < 0.06) {
        data.idlePhase += PUDDING_IDLE_WOBBLE_SPEED * dtSec;
      }
    }
  }

  private handleSupportLanding(a: Matter.Body, b: Matter.Body): void {
    const p =
      a.label === LABEL_PUDDING ? a : b.label === LABEL_PUDDING ? b : null;
    if (!p) return;
    const other = a === p ? b : a;
    const onGround = other.label === LABEL_GROUND;
    const onBase = other.label === LABEL_BASE;
    if (!onGround && !onBase) return;

    if (onGround) {
      const minX = this.craneX - SAFE_HALF_WIDTH;
      const maxX = this.craneX + SAFE_HALF_WIDTH;
      if (p.position.x < minX || p.position.x > maxX) {
        this.detachAndRemovePudding(p);
      }
    }
  }

  private detachAndRemovePudding(p: Matter.Body): void {
    if (this.grabConstraint?.bodyB === p) {
      this.releaseGrab();
      this.updateHud();
    }
    Composite.remove(this.world, p);
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
    const dmg = (bullet.plugin.bulletDmg as number) ?? BULLET_DAMAGE;
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
      this.triggerDefeatFx();
    }
    this.updateHud();
  }

  private handleEnemyPudding(
    a: Matter.Body,
    b: Matter.Body,
    now: number,
  ): void {
    const enemy =
      a.label === LABEL_ENEMY ? a : b.label === LABEL_ENEMY ? b : null;
    const pud =
      a.label === LABEL_PUDDING ? a : b.label === LABEL_PUDDING ? b : null;
    if (!enemy || !pud || this.gameOver) return;
    const data = pud.plugin.pudding as PuddingData | undefined;
    if (!data) return;

    const key = `${enemy.id}-${pud.id}`;
    const last = this.enemyHitPuddingCooldown.get(key) ?? 0;
    if (now - last < 450) return;
    this.enemyHitPuddingCooldown.set(key, now);

    data.hp -= ENEMY_DAMAGE_TO_PUDDING;
    if (data.hp <= 0) {
      this.detachAndRemovePudding(pud);
    }
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
    this.tickPassiveIncome(dt);
    this.tickPuddings(dt);
    this.tickPuddingJiggle(dt);
    this.tickEnemies();
    this.tickWaves(dt);
    this.tickBullets();
  }

  private tickPassiveIncome(dt: number): void {
    if (this.gameOver || PASSIVE_INCOME_PER_MINUTE <= 0) return;
    this.passiveIncomeFrac += (PASSIVE_INCOME_PER_MINUTE / 60_000) * dt;
    const whole = Math.floor(this.passiveIncomeFrac);
    if (whole <= 0) return;
    this.passiveIncomeFrac -= whole;
    this.money += whole;
    this.updateHud();
    this.showPassiveIncomeFx(whole);
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
          this.showProducerIncomeFx(body);
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
    bullet.plugin.bulletDmg = BULLET_DAMAGE;
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
    const n =
      ENEMIES_PER_SIDE_BASE +
      Math.floor(this.wave / ENEMIES_COUNT_SCALE_EVERY);
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
    const maxHp =
      ENEMY_HP * ENEMY_HP_WAVE_MULT ** Math.max(0, this.wave - 1);
    body.plugin.puddingEnemy = {
      hp: maxHp,
      maxHp,
    } satisfies EnemyData;
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
      this.updateHud();
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
    this.updateHud();
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
  }

  private createPuddingBody(kind: BlockKind, x: number, y: number): Matter.Body {
    let w = 48;
    let h = 40;
    let maxHp = SHOOTER_HP;
    if (kind === "defender") {
      w = 58;
      h = 46;
      maxHp = DEFENDER_HP;
    }
    if (kind === "producer") {
      w = 46;
      h = 42;
      maxHp = PRODUCER_BLOCK_HP;
    }

    const body = Bodies.rectangle(x, y, w, h, {
      chamfer: { radius: 6 },
      label: LABEL_PUDDING,
      friction: 0.75,
      frictionStatic: 0.9,
      density: kind === "defender" ? 0.008 : 0.004,
      collisionFilter: {
        category: CAT_BLOCK,
        mask: CAT_GROUND | CAT_ENEMY | CAT_BLOCK | CAT_BASE,
      },
    });

    const data: PuddingData = {
      kind,
      hp: maxHp,
      maxHp,
      shootAccumulator: 0,
      produceAccumulator: 0,
      jiggleX: 0,
      jiggleV: 0,
      idlePhase: Math.random() * Math.PI * 2,
    };
    body.plugin.pudding = data;
    body.plugin.puddingKind = kind;
    return body;
  }

  private showPassiveIncomeFx(amount: number): void {
    if (amount <= 0 || !this.statCoinsPill) return;
    const rect = this.statCoinsPill.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.35;
    spawnFloatText(
      this.fxOverlay,
      cx,
      cy,
      `+${amount}`,
      "fx-passive",
    );
    pulseElement(this.statCoinsPill, "fx-pulse-money");
  }

  private showProducerIncomeFx(body: Matter.Body): void {
    if (!this.statCoinsPill) return;
    const { x, y } = gameToScreen(this.canvas, body.position.x, body.position.y - 28);
    spawnFloatText(this.fxOverlay, x, y, `+${PRODUCER_AMOUNT}`, "fx-producer-pop");
    spawnFlyToElement(
      this.fxOverlay,
      x,
      y - 18,
      this.statCoinsPill,
      `+${PRODUCER_AMOUNT} 🪙`,
      "fx-fly-producer",
    );
    pulseElement(this.statCoinsPill, "fx-pulse-money");
  }

  private triggerDefeatFx(): void {
    if (this.defeatFxTriggered) return;
    this.defeatFxTriggered = true;

    const bx = this.baseBody.position.x;
    const by = this.baseBody.position.y;
    const colors = [
      "#8fb4ff",
      "#6b8ef0",
      "#c4d4ff",
      "#fff59d",
      "#ffffff",
      "#a5b4fc",
    ];
    for (let i = 0; i < 64; i++) {
      const ang = (Math.PI * 2 * i) / 64 + Math.random() * 0.5;
      const sp = 2.5 + Math.random() * 5.5;
      const maxLife = 900 + Math.random() * 500;
      this.defeatParticles.push({
        x: bx + (Math.random() - 0.5) * 28,
        y: by + (Math.random() - 0.5) * 28,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 2.2,
        life: maxLife,
        maxLife,
        r: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)]!,
      });
    }

    Composite.remove(this.world, this.baseBody);
    if (this.gameOverVeil) {
      this.gameOverVeil.hidden = false;
    }
    document.body.classList.add("game-over-shake");
    window.setTimeout(() => {
      document.body.classList.remove("game-over-shake");
    }, 520);
  }

  private updateHud(): void {
    this.moneyEl.textContent = String(this.money);
    this.waveEl.textContent = String(this.wave);
    this.baseHpEl.textContent = `${Math.ceil(this.baseHp)}${
      this.gameOver ? " 💔" : ""
    }`;
    this.rollCostEl.textContent = `-${ROLL_COST}`;
    this.btnRoll.disabled = this.gameOver || this.money < ROLL_COST;
    /** 费用变化后须重建三格按钮，否则「取出」仍保持加费前的 disabled */
    if (this.shopFilled) {
      this.renderShop();
    }
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
      btn.className = "btn btn-take";
      btn.textContent = `取出 ${TAKE_COST} 🪙`;
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
    const now = performance.now();
    const dtDraw = Math.min(48, Math.max(0, now - this.lastDrawTime));
    this.lastDrawTime = now;

    const ctx = this.ctx;
    const safeMin = this.craneX - SAFE_HALF_WIDTH;
    const safeMax = this.craneX + SAFE_HALF_WIDTH;
    drawSkyAndZones(ctx, safeMin, safeMax);

    const bodies = Composite.allBodies(this.world);
    const puddingBodies = bodies.filter((b) => b.label === LABEL_PUDDING);
    const enemyBodies = bodies.filter((b) => b.label === LABEL_ENEMY);

    const drawLayer = (labels: string[]) => {
      for (const body of bodies) {
        if (!labels.includes(body.label)) continue;
        if (body.label === LABEL_GROUND) {
          drawGroundCasual(ctx, body);
          continue;
        }
        if (body.label === LABEL_BASE) {
          drawBaseCasual(ctx, body);
          continue;
        }
        if (body.label === LABEL_PUDDING) {
          const kind = body.plugin.puddingKind as BlockKind;
          const data = body.plugin.pudding as PuddingData | undefined;
          const w = body.bounds.max.x - body.bounds.min.x;
          const h = body.bounds.max.y - body.bounds.min.y;
          const held = this.grabConstraint?.bodyB === body;
          const spd = Matter.Vector.magnitude(body.velocity);
          const av = Math.abs(body.angularVelocity);
          const idleOk = spd < 0.18 && av < 0.06;
          const idleWobble = idleOk
            ? Math.sin(data?.idlePhase ?? 0) * PUDDING_IDLE_WOBBLE_AMP
            : 0;
          let heldTilt = 0;
          if (held) {
            const pull =
              (this.hook.position.x - body.position.x) / Math.max(220, h * 5);
            heldTilt = Math.max(
              -PUDDING_HELD_SWAY_AMP,
              Math.min(PUDDING_HELD_SWAY_AMP, pull * 0.22),
            );
          }
          const jx = data?.jiggleX ?? 0;
          const squash = Math.max(0, jx) * 0.1;
          const stretch = Math.max(0, -jx) * 0.07;
          const scaleX = 1 + squash * 0.38 - stretch * 0.22;
          const scaleY = 1 - squash + stretch * 0.45;

          ctx.save();
          ctx.translate(body.position.x, body.position.y);
          ctx.rotate(body.angle + idleWobble + heldTilt);
          ctx.scale(scaleX, scaleY);
          drawPuddingBodyLocal(ctx, w, h, kind);
          ctx.restore();

          if (data && data.hp < data.maxHp) {
            const barW = Math.min(56, Math.max(28, w - 6));
            const topY = body.position.y - (h * scaleY) / 2 - 4;
            drawHealthBarPill(
              ctx,
              body.position.x,
              topY,
              barW,
              Math.max(0, data.hp / data.maxHp),
              "friendly",
            );
          }
          this.drawPuddingEyes(
            ctx,
            body,
            puddingBodies,
            enemyBodies,
            now,
            idleWobble + heldTilt,
          );
          continue;
        }
        if (body.label === LABEL_ENEMY) {
          drawEnemyCasual(ctx, body);
          const ed = body.plugin.puddingEnemy as EnemyData | undefined;
          if (ed) {
            const t = ed.hp / (ed.maxHp > 0 ? ed.maxHp : ENEMY_HP);
            drawHealthBarPill(
              ctx,
              body.position.x,
              body.bounds.min.y,
              38,
              Math.max(0, t),
              "foe",
            );
          }
          this.drawEnemyEyes(ctx, body, puddingBodies, now);
          continue;
        }
        if (body.label === LABEL_BULLET) {
          drawBulletCasual(ctx, body.position.x, body.position.y);
        }
      }
    };

    drawLayer([LABEL_GROUND, LABEL_BASE, LABEL_PUDDING, LABEL_ENEMY, LABEL_BULLET]);

    if (this.grabConstraint) {
      const other = this.grabConstraint.bodyB;
      if (other) {
        drawRopeCasual(
          ctx,
          this.hook.position.x,
          this.hook.position.y,
          other.position.x,
          other.position.y,
        );
      }
    }

    drawHookCasual(ctx, this.hook.position.x, this.hook.position.y);

    this.tickAndDrawDefeatParticles(ctx, dtDraw);
  }

  private tickAndDrawDefeatParticles(
    ctx: CanvasRenderingContext2D,
    dtMs: number,
  ): void {
    if (this.defeatParticles.length === 0) return;
    const g = dtMs / 16.67;
    this.defeatParticles = this.defeatParticles.filter((p) => {
      p.life -= dtMs;
      p.x += p.vx * g;
      p.y += p.vy * g;
      p.vy += 0.14 * g;
      p.vx *= Math.pow(0.992, g);
      return p.life > 0;
    });
    for (const p of this.defeatParticles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = a * 0.95;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private updateEyeBlink(body: Matter.Body, now: number): number {
    initEyeBlink(body, now);
    const st = body.plugin.eyeBlink as EyeBlinkState;
    if (st.blinkUntil > 0 && now >= st.blinkUntil) {
      st.blinkUntil = 0;
    }
    if (st.blinkUntil === 0 && now >= st.nextAt) {
      st.blinkUntil = now + EYE_BLINK_DURATION_MS;
      st.nextAt = st.blinkUntil + randomBlinkGap();
    }
    if (st.blinkUntil <= 0 || now >= st.blinkUntil) {
      return 0;
    }
    const t0 = st.blinkUntil - EYE_BLINK_DURATION_MS;
    const progress = Math.min(
      1,
      Math.max(0, (now - t0) / EYE_BLINK_DURATION_MS),
    );
    return Math.sin(Math.PI * progress);
  }

  private drawCharacterEyes(
    ctx: CanvasRenderingContext2D,
    self: Matter.Body,
    gazeWorld: Matter.Vector | null,
    now: number,
    colors: { white: string; rim: string; pupil: string },
    extraAngle = 0,
  ): void {
    const w = self.bounds.max.x - self.bounds.min.x;
    const h = self.bounds.max.y - self.bounds.min.y;
    const eyeR = Math.max(4.5, Math.min(8, w * 0.13));
    const pupilR = eyeR * 0.42;
    const maxPupilShift = eyeR - pupilR - 0.8;
    const spread = w * 0.22;
    const yOff = -h * 0.1;

    const squish = this.updateEyeBlink(self, now);
    const drawAngle = self.angle + extraAngle;

    ctx.save();
    ctx.translate(self.position.x, self.position.y);
    ctx.rotate(drawAngle);

    const drawOneEye = (lx: number, ly: number) => {
      const ry = eyeR * (1 - squish * 0.88) + eyeR * 0.1 * squish;
      const rx = eyeR * (1 + squish * 0.08);

      ctx.fillStyle = colors.white;
      ctx.beginPath();
      ctx.ellipse(lx, ly, rx, Math.max(0.6, ry), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.rim;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (squish < 0.55 && gazeWorld) {
        const cos = Math.cos(drawAngle);
        const sin = Math.sin(drawAngle);
        const eyeWx = self.position.x + lx * cos - ly * sin;
        const eyeWy = self.position.y + lx * sin + ly * cos;
        const toGaze = Matter.Vector.sub(gazeWorld, {
          x: eyeWx,
          y: eyeWy,
        });
        const shifted = clampMag(toGaze, maxPupilShift);
        const localOff = Matter.Vector.rotate(shifted, -drawAngle);
        const px = lx + localOff.x;
        const py = ly + localOff.y;

        ctx.fillStyle = colors.pupil;
        ctx.beginPath();
        ctx.arc(px, py, pupilR, 0, Math.PI * 2);
        ctx.fill();
      } else if (squish < 0.55 && !gazeWorld) {
        ctx.fillStyle = colors.pupil;
        ctx.beginPath();
        ctx.arc(lx, ly, pupilR, 0, Math.PI * 2);
        ctx.fill();
      }

      if (squish > 0.35) {
        ctx.strokeStyle = colors.rim;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(lx - rx * 0.85, ly);
        ctx.lineTo(lx + rx * 0.85, ly);
        ctx.stroke();
      }
    };

    drawOneEye(-spread, yOff);
    drawOneEye(spread, yOff);

    ctx.restore();
  }

  private drawPuddingEyes(
    ctx: CanvasRenderingContext2D,
    self: Matter.Body,
    puddings: Matter.Body[],
    enemies: Matter.Body[],
    now: number,
    extraAngle = 0,
  ): void {
    let gazeWorld: Matter.Vector | null = null;

    let bestEnemy: Matter.Body | null = null;
    let bestEnemyD = PUDDING_EYE_ENEMY_RANGE + 1;
    for (const e of enemies) {
      const d = Matter.Vector.magnitude(
        Matter.Vector.sub(e.position, self.position),
      );
      if (d < bestEnemyD && d <= PUDDING_EYE_ENEMY_RANGE) {
        bestEnemyD = d;
        bestEnemy = e;
      }
    }
    if (bestEnemy) {
      gazeWorld = bestEnemy.position;
    } else {
      let bestNeighbor: Matter.Body | null = null;
      let bestNeighborD = PUDDING_EYE_NEIGHBOR_RANGE + 1;
      for (const p of puddings) {
        if (p.id === self.id) continue;
        const d = Matter.Vector.magnitude(
          Matter.Vector.sub(p.position, self.position),
        );
        if (d < bestNeighborD && d <= PUDDING_EYE_NEIGHBOR_RANGE) {
          bestNeighborD = d;
          bestNeighbor = p;
        }
      }
      if (bestNeighbor) {
        gazeWorld = bestNeighbor.position;
      }
    }

    this.drawCharacterEyes(
      ctx,
      self,
      gazeWorld,
      now,
      {
        white: "#ffffff",
        rim: "#57534e",
        pupil: "#44403c",
      },
      extraAngle,
    );
  }

  private drawEnemyEyes(
    ctx: CanvasRenderingContext2D,
    self: Matter.Body,
    puddings: Matter.Body[],
    now: number,
  ): void {
    let gazeWorld: Matter.Vector | null = null;
    let bestD = ENEMY_EYE_PUDDING_RANGE + 1;
    for (const p of puddings) {
      const d = Matter.Vector.magnitude(
        Matter.Vector.sub(p.position, self.position),
      );
      if (d < bestD && d <= ENEMY_EYE_PUDDING_RANGE) {
        bestD = d;
        gazeWorld = p.position;
      }
    }
    if (!gazeWorld) {
      gazeWorld = { x: WIDTH / 2, y: GROUND_Y - 36 };
    }

    this.drawCharacterEyes(ctx, self, gazeWorld, now, {
      white: "#fffbeb",
      rim: "#78350f",
      pupil: "#422006",
    });
  }
}
