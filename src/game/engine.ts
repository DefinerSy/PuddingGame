import Matter from "matter-js";
import {
  BASE_MAX_HP,
  BASE_UPGRADE_COST_BASE,
  BASE_UPGRADE_COST_PER_LEVEL,
  BASE_UPGRADE_HOOK_LIFT,
  BASE_UPGRADE_MAX_LEVEL,
  BASE_UPGRADE_SKY_EXTRA,
  BASE_UPGRADE_SPAWN_PUSH,
  BASE_UPGRADE_VIEW_ZOOM_MUL,
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
  ENEMY_SPEED,
  ENEMY_EYE_PUDDING_RANGE,
  EYE_BLINK_DURATION_MS,
  EYE_BLINK_GAP_MAX_MS,
  EYE_BLINK_GAP_MIN_MS,
  GROUND_THICK,
  GROUND_Y,
  MERGE_ALIGN_MAX_PX,
  MERGE_FACE_GAP_MAX,
  MERGE_FACE_GAP_MIN,
  MERGE_MAX_ANGLE_RAD,
  MERGE_MAX_STACK_DEPTH,
  MERGE_MIN_HORIZONTAL_OVERLAP_FRAC,
  MERGE_MAX_PROJECTILES,
  MERGE_MULTI_SHOT_SPREAD_RAD,
  MERGE_POWER_BASE,
  PRODUCER_AMOUNT,
  PRODUCER_INTERVAL_MS,
  ROLL_COST_BASE,
  ROLL_COST_MAX,
  ROLL_COST_PER_BLOCK_PURCHASED,
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
  TAKE_COST_BASE,
  TAKE_COST_MAX,
  TAKE_COST_PER_BLOCK_PURCHASED,
  WAVE_INTERVAL_MS,
  WAVE_START_DELAY_MS,
  WIDTH,
  HEIGHT,
} from "./config";
import {
  createEnemyPluginData,
  enemySpawnCenterY,
  ENEMY_KIND_DEFS,
  pickEnemyKind,
} from "./enemies";
import type { BlockKind, EnemyData, PuddingData } from "./types";
import {
  drawBaseCasual,
  drawBulletCasual,
  drawEnemyCasual,
  drawGameOverBanner,
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
  private mergeQueue: Array<{ bottom: Matter.Body; top: Matter.Body }> = [];

  private shopSlots: BlockKind[] = [];
  private shopFilled = false;
  /** 第一局老虎机必含至少一格射手，避免开局无输出崩盘 */
  private firstRollDone = false;
  /** 本局累计从商店取出的方块数，Roll/取出涨价持续累加（Roll 不清零） */
  private blocksPurchased = 0;
  /** 基地升级次数：抬高天空、吊机、拉远镜头、敌人生成更远 */
  private baseUpgradeLevel = 0;
  /** 当前世界「草地顶」y（升级后下移，天空变高） */
  private worldGroundY = GROUND_Y;
  /** 吊机挂钩 y */
  private hookY = CRANE_HOOK_Y;
  private viewScale = 1;
  private viewOffsetX = 0;
  private viewOffsetY = 0;

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
  private btnBaseUpgrade = document.getElementById(
    "btn-base-upgrade",
  ) as HTMLButtonElement | null;
  private upgradeCostEl = document.getElementById("upgrade-cost")!;
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

    this.engine = Engine.create({
      enableSleeping: true,
      positionIterations: 12,
      velocityIterations: 10,
      constraintIterations: 4,
    });
    this.world = this.engine.world;
    this.engine.gravity.y = 1;

    this.applyViewParams();

    this.ground = Bodies.rectangle(
      WIDTH / 2,
      this.worldGroundY + GROUND_THICK / 2,
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

    this.hook = Bodies.circle(this.craneX, this.hookY, 12, {
      isStatic: true,
      label: LABEL_HOOK,
      collisionFilter: { category: CAT_HOOK, mask: 0 },
    });

    this.baseBody = Bodies.rectangle(WIDTH / 2, this.worldGroundY - 36, 72, 72, {
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
    Events.on(this.engine, "afterUpdate", () => this.clampPuddingsAboveGround());
  }

  start(): void {
    this.loop();
    this.renderShop();
    this.updateHud();
  }

  private getUpgradeCost(): number {
    if (this.baseUpgradeLevel >= BASE_UPGRADE_MAX_LEVEL) return 0;
    return (
      BASE_UPGRADE_COST_BASE +
      this.baseUpgradeLevel * BASE_UPGRADE_COST_PER_LEVEL
    );
  }

  /** 世界高度随升级变高（画布逻辑高度） */
  private getWorldHeight(): number {
    return HEIGHT + this.baseUpgradeLevel * BASE_UPGRADE_SKY_EXTRA;
  }

  private applyViewParams(): void {
    const wh = this.getWorldHeight();
    const fit = HEIGHT / wh;
    this.viewScale =
      fit * BASE_UPGRADE_VIEW_ZOOM_MUL ** this.baseUpgradeLevel;
    this.viewOffsetX = (WIDTH - WIDTH * this.viewScale) / 2;
    this.viewOffsetY = (HEIGHT - wh * this.viewScale) / 2;
  }

  /** 扩展天空：地面与基地下移，吊机上移，布丁与敌人整体上移相同 delta */
  private applyBaseExpand(): void {
    const delta = BASE_UPGRADE_SKY_EXTRA;
    this.worldGroundY += delta;
    this.hookY -= BASE_UPGRADE_HOOK_LIFT;

    Body.setPosition(this.ground, {
      x: this.ground.position.x,
      y: this.ground.position.y + delta,
    });
    Body.setPosition(this.baseBody, {
      x: this.baseBody.position.x,
      y: this.baseBody.position.y + delta,
    });
    Body.setPosition(this.hook, { x: this.craneX, y: this.hookY });

    /** 吊机上移 hookLift：方块应随地面下移 (delta)，再抵消挂钩上移，净位移 -(delta - hookLift) */
    const hookLift = BASE_UPGRADE_HOOK_LIFT;
    const dyBlocks = -(delta - hookLift);
    const bodies = Composite.allBodies(this.world);
    for (const b of bodies) {
      if (
        b.label === LABEL_GROUND ||
        b.label === LABEL_HOOK ||
        b.label === LABEL_BASE
      ) {
        continue;
      }
      Body.translate(b, { x: 0, y: dyBlocks });
    }

    this.applyViewParams();
  }

  private tryBaseUpgrade(): void {
    if (this.gameOver) return;
    if (this.baseUpgradeLevel >= BASE_UPGRADE_MAX_LEVEL) return;
    const cost = this.getUpgradeCost();
    if (this.money < cost) return;
    this.money -= cost;
    this.baseUpgradeLevel += 1;
    this.applyBaseExpand();
    this.updateHud();
    if (this.statCoinsPill) {
      const r = this.statCoinsPill.getBoundingClientRect();
      spawnFloatText(
        this.fxOverlay,
        r.left + r.width / 2,
        r.top + 20,
        `基地 Lv.${this.baseUpgradeLevel}`,
        "fx-passive",
        1400,
      );
    }
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
    const internalX = (clientX - rect.left) * (WIDTH / rect.width);
    return (internalX - this.viewOffsetX) / this.viewScale;
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
      Body.setPosition(this.hook, { x: this.craneX, y: this.hookY });
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
    this.btnBaseUpgrade?.addEventListener("click", () => this.tryBaseUpgrade());
  }

  private bindCollisions(): void {
    Events.on(this.engine, "collisionStart", (ev: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of ev.pairs) {
        const { bodyA, bodyB } = pair;
        this.handleSupportLanding(bodyA, bodyB);
        this.handleBulletHit(bodyA, bodyB);
        this.applyPuddingJiggleFromPair(pair);
        this.queuePerfectMerge(bodyA, bodyB);
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
    if (
      a.label === LABEL_GROUND ||
      b.label === LABEL_GROUND ||
      a.label === LABEL_BASE ||
      b.label === LABEL_BASE
    ) {
      return;
    }
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
      if (data.stackDepth === undefined) {
        data.stackDepth = 1;
        data.powerMult = 1;
      }
      if (data.mergeRangeMul === undefined) {
        data.mergeRangeMul = 1;
        data.mergeProjectileCount = 1;
        data.mergeProducerGainMul = 1;
      }
      if (data.displayW === undefined || data.displayH === undefined) {
        const bw = body.bounds.max.x - body.bounds.min.x;
        const bh = body.bounds.max.y - body.bounds.min.y;
        data.displayW = bw;
        data.displayH = bh;
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

  /** 防止大刚体旋转时 SAT 迭代不足而穿入地面（用顶点检测，不用 AABB） */
  private clampPuddingsAboveGround(): void {
    if (this.gameOver) return;
    const groundTop = this.worldGroundY;
    const slop = 1.2;
    const bodies = Composite.allBodies(this.world);
    for (const body of bodies) {
      if (body.label !== LABEL_PUDDING || body.isStatic) continue;
      const verts = body.vertices;
      if (!verts.length) continue;
      let maxY = verts[0]!.y;
      for (let i = 1; i < verts.length; i++) {
        const y = verts[i]!.y;
        if (y > maxY) maxY = y;
      }
      if (maxY <= groundTop - slop) continue;
      const dy = groundTop - slop - maxY;
      Body.translate(body, { x: 0, y: dy });
      Body.setVelocity(body, {
        x: body.velocity.x * 0.99,
        y: Math.min(0, body.velocity.y),
      });
      Body.setAngularVelocity(body, body.angularVelocity * 0.94);
    }
    this.settlePuddingsOnGround();
  }

  /** 落地且几乎静止时阻尼角速度，避免方块被微碰撞持续翘起 */
  private settlePuddingsOnGround(): void {
    if (this.gameOver) return;
    const gt = this.worldGroundY;
    const bodies = Composite.allBodies(this.world);
    for (const body of bodies) {
      if (body.label !== LABEL_PUDDING) continue;
      if (this.grabConstraint?.bodyB === body) continue;
      const verts = body.vertices;
      if (!verts.length) continue;
      let maxY = verts[0]!.y;
      for (let i = 1; i < verts.length; i++) {
        const y = verts[i]!.y;
        if (y > maxY) maxY = y;
      }
      if (maxY < gt - 3) continue;
      const spd = Matter.Vector.magnitude(body.velocity);
      if (spd > 0.22) continue;
      const av = body.angularVelocity;
      Body.setAngularVelocity(body, av * 0.65);
      if (Math.abs(body.angularVelocity) < 0.02) {
        Body.setAngularVelocity(body, 0);
        if (Math.abs(body.angle) < 0.05) {
          Body.setAngle(body, 0);
        }
      }
    }
  }

  private queuePerfectMerge(a: Matter.Body, b: Matter.Body): void {
    if (this.gameOver) return;
    if (a.label !== LABEL_PUDDING || b.label !== LABEL_PUDDING) return;
    const top = a.position.y <= b.position.y ? a : b;
    const bottom = top === a ? b : a;

    const da = top.plugin.pudding as PuddingData | undefined;
    const db = bottom.plugin.pudding as PuddingData | undefined;
    if (!da || !db || da.kind !== db.kind) return;

    const alignOk =
      Math.abs(top.position.x - bottom.position.x) <= MERGE_ALIGN_MAX_PX;
    const angOk =
      Math.abs(top.angle) <= MERGE_MAX_ANGLE_RAD &&
      Math.abs(bottom.angle) <= MERGE_MAX_ANGLE_RAD;
    /** 上块底边 y − 下块顶边 y：≈0 为贴合，略正为压入，负为分离 */
    const faceGap = top.bounds.max.y - bottom.bounds.min.y;
    const vertOk =
      faceGap >= MERGE_FACE_GAP_MIN && faceGap <= MERGE_FACE_GAP_MAX;
    const tw = top.bounds.max.x - top.bounds.min.x;
    const bw = bottom.bounds.max.x - bottom.bounds.min.x;
    const minW = Math.min(tw, bw);
    const hOverlap =
      Math.min(top.bounds.max.x, bottom.bounds.max.x) -
      Math.max(top.bounds.min.x, bottom.bounds.min.x);
    const hOverlapOk =
      minW > 0 && hOverlap >= minW * MERGE_MIN_HORIZONTAL_OVERLAP_FRAC;

    if (!alignOk || !angOk || !vertOk || !hOverlapOk) return;

    const dBottom = bottom.plugin.pudding as PuddingData;
    const dTop = top.plugin.pudding as PuddingData;
    const sb = dBottom.stackDepth ?? 1;
    const st = dTop.stackDepth ?? 1;
    if (sb + st > MERGE_MAX_STACK_DEPTH) return;

    const key =
      bottom.id < top.id
        ? `${bottom.id}-${top.id}`
        : `${top.id}-${bottom.id}`;
    for (const m of this.mergeQueue) {
      const k =
        m.bottom.id < m.top.id
          ? `${m.bottom.id}-${m.top.id}`
          : `${m.top.id}-${m.bottom.id}`;
      if (k === key) return;
    }
    this.mergeQueue.push({ bottom, top });
  }

  private processMergeQueue(): void {
    while (this.mergeQueue.length > 0) {
      const { bottom, top } = this.mergeQueue.shift()!;
      this.tryMergePuddings(bottom, top);
    }
  }

  private tryMergePuddings(bottom: Matter.Body, top: Matter.Body): void {
    if (this.gameOver) return;
    const bodies = Composite.allBodies(this.world);
    if (!bodies.includes(bottom) || !bodies.includes(top)) return;
    if (this.grabConstraint?.bodyB === bottom || this.grabConstraint?.bodyB === top) {
      return;
    }

    const db = bottom.plugin.pudding as PuddingData | undefined;
    const dt = top.plugin.pudding as PuddingData | undefined;
    if (!db || !dt || db.kind !== dt.kind) return;

    const alignOk =
      Math.abs(top.position.x - bottom.position.x) <= MERGE_ALIGN_MAX_PX * 1.4;
    const angOk =
      Math.abs(top.angle) <= MERGE_MAX_ANGLE_RAD * 1.4 &&
      Math.abs(bottom.angle) <= MERGE_MAX_ANGLE_RAD * 1.4;
    const faceGap = top.bounds.max.y - bottom.bounds.min.y;
    const vertOk =
      faceGap >= MERGE_FACE_GAP_MIN - 4 &&
      faceGap <= MERGE_FACE_GAP_MAX + 12;
    if (top.bounds.min.y > bottom.bounds.max.y + 20) return;
    const topW = top.bounds.max.x - top.bounds.min.x;
    const botW = bottom.bounds.max.x - bottom.bounds.min.x;
    const minW = Math.min(topW, botW);
    const hOverlap =
      Math.min(top.bounds.max.x, bottom.bounds.max.x) -
      Math.max(top.bounds.min.x, bottom.bounds.min.x);
    const hOverlapOk =
      minW > 0 && hOverlap >= minW * (MERGE_MIN_HORIZONTAL_OVERLAP_FRAC * 0.92);
    if (!alignOk || !angOk || !vertOk || !hOverlapOk) return;

    const sb = db.stackDepth ?? 1;
    const st = dt.stackDepth ?? 1;
    if (sb + st > MERGE_MAX_STACK_DEPTH) return;

    const mb = db.powerMult ?? 1;
    const mt = dt.powerMult ?? 1;
    const stackDepth = sb + st;
    const mergeScale = MERGE_POWER_BASE * (mb + mt) * 0.5;

    let powerMult = 1;
    let mergeRangeMul = 1;
    let mergeProjectileCount = 1;
    let mergeProducerGainMul = 1;
    if (db.kind === "defender") {
      powerMult = mergeScale;
    } else if (db.kind === "shooter") {
      mergeRangeMul = mergeScale;
      mergeProjectileCount = Math.min(
        MERGE_MAX_PROJECTILES,
        Math.max(1, Math.round(mergeScale)),
      );
    } else if (db.kind === "producer") {
      mergeProducerGainMul = mergeScale;
    }

    const mergedW = Math.max(botW, topW);
    const minY = top.bounds.min.y;
    const maxY = bottom.bounds.max.y;
    const mergedH = maxY - minY;
    const centerX = (top.bounds.min.x + top.bounds.max.x + bottom.bounds.min.x + bottom.bounds.max.x) / 4;
    const centerY = (minY + maxY) / 2;

    const newMaxHp = db.maxHp + dt.maxHp;
    const newHp = Math.min(newMaxHp, db.hp + dt.hp);

    const kind = db.kind;
    Composite.remove(this.world, bottom);
    Composite.remove(this.world, top);

    const merged = Bodies.rectangle(centerX, centerY, mergedW, mergedH, {
      chamfer: { radius: 6 },
      label: LABEL_PUDDING,
      friction: 0.88,
      frictionStatic: 1,
      density: kind === "defender" ? 0.008 : 0.004,
      angle: 0,
      collisionFilter: {
        category: CAT_BLOCK,
        mask: CAT_GROUND | CAT_ENEMY | CAT_BLOCK | CAT_BASE,
      },
    });

    const data: PuddingData = {
      kind,
      hp: newHp,
      maxHp: newMaxHp,
      shootAccumulator: 0,
      produceAccumulator: 0,
      jiggleX: 0,
      jiggleV: 0,
      idlePhase: Math.random() * Math.PI * 2,
      stackDepth,
      powerMult,
      mergeRangeMul,
      mergeProjectileCount,
      mergeProducerGainMul,
      displayW: mergedW,
      displayH: mergedH,
    };
    merged.plugin.pudding = data;
    merged.plugin.puddingKind = kind;
    merged.plugin.mergeFlashUntil = performance.now() + 520;
    Composite.add(this.world, merged);
    Body.setVelocity(merged, { x: 0, y: 0 });
    Body.setAngularVelocity(merged, 0);
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
    const ed = enemy.plugin.puddingEnemy as EnemyData | undefined;
    this.baseBody.plugin.hitFlashUntil = now + 320;
    const dmg = ed?.damageToBase ?? ENEMY_DAMAGE;
    this.baseHp -= dmg;
    const basePill = document.querySelector(".stat-pill.stat-base");
    if (basePill) {
      pulseElement(basePill as HTMLElement, "fx-base-hit", 380);
    }
    const r = this.baseBody.bounds;
    const cx = (r.min.x + r.max.x) / 2;
    const cy = r.min.y - 8;
    const scr = gameToScreen(this.canvas, cx, cy, {
      viewScale: this.viewScale,
      viewOffsetX: this.viewOffsetX,
      viewOffsetY: this.viewOffsetY,
      worldHeight: this.getWorldHeight(),
    });
    spawnFloatText(
      this.fxOverlay,
      scr.x,
      scr.y,
      `-${dmg}`,
      "fx-base-dmg",
      700,
    );
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

    const ed = enemy.plugin.puddingEnemy as EnemyData | undefined;
    const chip = ed?.damageToPudding ?? ENEMY_DAMAGE_TO_PUDDING;

    const key = `${enemy.id}-${pud.id}`;
    const last = this.enemyHitPuddingCooldown.get(key) ?? 0;
    if (now - last < 450) return;
    this.enemyHitPuddingCooldown.set(key, now);

    const tank = data.kind === "defender" ? (data.powerMult ?? 1) : 1;
    data.hp -= chip / tank;
    if (data.hp <= 0) {
      this.detachAndRemovePudding(pud);
    }
  }

  private onBeforeUpdate(): void {
    if (!this.gameOver) {
      this.processMergeQueue();
    }

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
    Body.setPosition(this.hook, { x: this.craneX, y: this.hookY });

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
          const gainMul = data.mergeProducerGainMul ?? 1;
          const gain = Math.max(1, Math.round(PRODUCER_AMOUNT * gainMul));
          this.money += gain;
          this.updateHud();
          this.showProducerIncomeFx(body, gain);
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
    const top = this.worldGroundY - body.bounds.max.y;
    return Math.max(0, top);
  }

  private tryShoot(body: Matter.Body, data: PuddingData): void {
    const rangeMul = data.mergeRangeMul ?? 1;
    const range =
      SHOOT_RANGE_BASE * rangeMul +
      this.heightBonus(body) * SHOOT_RANGE_PER_HEIGHT;
    const n = Math.max(1, Math.round(data.mergeProjectileCount ?? 1));
    const bodies = Composite.allBodies(this.world);
    const enemies = bodies.filter((b) => b.label === LABEL_ENEMY);
    if (enemies.length === 0) return;

    const used = new Set<number>();
    for (let i = 0; i < n; i++) {
      let best: Matter.Body | null = null;
      let bestD = range + 1;
      for (const other of enemies) {
        if (used.has(other.id)) continue;
        const d = Matter.Vector.magnitude(
          Matter.Vector.sub(other.position, body.position),
        );
        if (d <= range && d < bestD) {
          bestD = d;
          best = other;
        }
      }
      if (!best) break;
      used.add(best.id);

      let dir = Matter.Vector.normalise(
        Matter.Vector.sub(best.position, body.position),
      );
      if (n > 1) {
        const t =
          (i - (n - 1) / 2) * MERGE_MULTI_SHOT_SPREAD_RAD;
        dir = Matter.Vector.rotate(dir, t);
      }
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
  }

  private tickEnemies(): void {
    const targetX = WIDTH / 2;
    const bodies = Composite.allBodies(this.world);
    for (const body of bodies) {
      if (body.label !== LABEL_ENEMY) continue;
      const ed = body.plugin.puddingEnemy as EnemyData | undefined;
      const spd = ed?.moveSpeed ?? ENEMY_SPEED;
      const toward = targetX - body.position.x;
      const sign = toward === 0 ? 0 : toward > 0 ? 1 : -1;
      Body.setVelocity(body, { x: sign * spd, y: body.velocity.y });
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
    const push = this.baseUpgradeLevel * BASE_UPGRADE_SPAWN_PUSH;
    for (let i = 0; i < n; i++) {
      this.spawnEnemy(40 + push + i * 18, true);
      this.spawnEnemy(WIDTH - 40 - push - i * 18, false);
    }
    this.updateHud();
  }

  private spawnEnemy(x: number, fromLeft: boolean): void {
    const kind = pickEnemyKind(this.wave);
    const def = ENEMY_KIND_DEFS[kind];
    const cy = enemySpawnCenterY(this.worldGroundY, def.h);
    const body = Bodies.rectangle(x, cy, def.w, def.h, {
      label: LABEL_ENEMY,
      frictionAir: def.frictionAir,
      density: def.density,
      collisionFilter: {
        category: CAT_ENEMY,
        mask: CAT_GROUND | CAT_BLOCK | CAT_BASE | CAT_BULLET,
      },
    });
    const data = createEnemyPluginData(kind, this.wave);
    body.plugin.puddingEnemy = data;
    Body.setVelocity(body, {
      x: fromLeft ? data.moveSpeed : -data.moveSpeed,
      y: 0,
    });
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

  private getRollCost(): number {
    return Math.min(
      ROLL_COST_MAX,
      ROLL_COST_BASE + this.blocksPurchased * ROLL_COST_PER_BLOCK_PURCHASED,
    );
  }

  private getTakeCost(): number {
    return Math.min(
      TAKE_COST_MAX,
      TAKE_COST_BASE + this.blocksPurchased * TAKE_COST_PER_BLOCK_PURCHASED,
    );
  }

  private rollShop(): void {
    if (this.gameOver) return;
    const cost = this.getRollCost();
    if (this.money < cost) return;
    this.money -= cost;
    let a = randomKind();
    let b = randomKind();
    let c = randomKind();
    if (!this.firstRollDone) {
      this.firstRollDone = true;
      if (a !== "shooter" && b !== "shooter" && c !== "shooter") {
        const slot = Math.floor(Math.random() * 3);
        if (slot === 0) a = "shooter";
        else if (slot === 1) b = "shooter";
        else c = "shooter";
      }
    }
    this.shopSlots = [a, b, c];
    this.shopFilled = true;
    this.updateHud();
  }

  private takeFromSlot(index: number): void {
    if (this.gameOver) return;
    if (!this.shopFilled || index < 0 || index >= this.shopSlots.length) {
      return;
    }
    const cost = this.getTakeCost();
    if (this.money < cost) return;
    if (this.heldBody) return;

    this.money -= cost;
    const kind = this.shopSlots[index]!;
    this.shopSlots.splice(index, 1);
    this.blocksPurchased += 1;
    if (this.shopSlots.length === 0) {
      this.shopFilled = false;
    }

    const body = this.createPuddingBody(kind, this.craneX, this.hookY + 120);
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
      friction: 0.88,
      frictionStatic: 1,
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
      stackDepth: 1,
      powerMult: 1,
      mergeRangeMul: 1,
      mergeProjectileCount: 1,
      mergeProducerGainMul: 1,
      displayW: w,
      displayH: h,
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

  private showProducerIncomeFx(body: Matter.Body, amount: number): void {
    if (!this.statCoinsPill) return;
    const { x, y } = gameToScreen(
      this.canvas,
      body.position.x,
      body.position.y - 28,
      {
        viewScale: this.viewScale,
        viewOffsetX: this.viewOffsetX,
        viewOffsetY: this.viewOffsetY,
        worldHeight: this.getWorldHeight(),
      },
    );
    spawnFloatText(this.fxOverlay, x, y, `+${amount}`, "fx-producer-pop");
    spawnFlyToElement(
      this.fxOverlay,
      x,
      y - 18,
      this.statCoinsPill,
      `+${amount} 🪙`,
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
    this.rollCostEl.textContent = `-${this.getRollCost()}`;
    this.btnRoll.disabled = this.gameOver || this.money < this.getRollCost();
    const maxLv = BASE_UPGRADE_MAX_LEVEL;
    if (this.baseUpgradeLevel >= maxLv) {
      this.upgradeCostEl.textContent = `已满 Lv.${maxLv}`;
    } else {
      this.upgradeCostEl.textContent = `-${this.getUpgradeCost()}`;
    }
    if (this.btnBaseUpgrade) {
      this.btnBaseUpgrade.disabled =
        this.gameOver ||
        this.baseUpgradeLevel >= maxLv ||
        this.money < this.getUpgradeCost();
    }
    /** 始终刷新商店 DOM：有货时同步按钮与价格；清空时移除残留格子（曾仅在 shopFilled 时 render 导致剩一格不消失） */
    this.renderShop();
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
      const keyNum = index + 1;
      const badge = document.createElement("span");
      badge.className = "slot-key";
      badge.textContent = String(keyNum);
      badge.title = `快捷键 ${keyNum}`;
      const title = document.createElement("div");
      title.className = `slot-type ${kind}`;
      title.textContent = kindLabel(kind);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-take";
      btn.textContent = `取出 ${this.getTakeCost()} 🪙`;
      btn.disabled =
        this.gameOver ||
        this.money < this.getTakeCost() ||
        !!this.grabConstraint;
      btn.addEventListener("click", () => this.takeFromSlot(index));
      div.appendChild(badge);
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
    const wh = this.getWorldHeight();
    const safeMin = this.craneX - SAFE_HALF_WIDTH;
    const safeMax = this.craneX + SAFE_HALF_WIDTH;

    ctx.save();
    ctx.setTransform(this.viewScale, 0, 0, this.viewScale, this.viewOffsetX, this.viewOffsetY);

    drawSkyAndZones(ctx, safeMin, safeMax, this.worldGroundY);

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
          drawBaseCasual(ctx, body, now);
          continue;
        }
        if (body.label === LABEL_PUDDING) {
          const kind = body.plugin.puddingKind as BlockKind;
          const data = body.plugin.pudding as PuddingData | undefined;
          const w =
            data?.displayW ??
            body.bounds.max.x - body.bounds.min.x;
          const h =
            data?.displayH ??
            body.bounds.max.y - body.bounds.min.y;
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

          const flashUntil = body.plugin.mergeFlashUntil as number | undefined;
          if (flashUntil && now < flashUntil) {
            const t = (flashUntil - now) / 520;
            ctx.save();
            ctx.translate(body.position.x, body.position.y);
            ctx.rotate(body.angle);
            ctx.strokeStyle = `rgba(250, 204, 21, ${0.35 + t * 0.5})`;
            ctx.lineWidth = 4;
            ctx.shadowColor = "rgba(250, 204, 21, 0.8)";
            ctx.shadowBlur = 14;
            const x = -w / 2 - 3;
            const y = -h / 2 - 3;
            ctx.strokeRect(x, y, w + 6, h + 6);
            ctx.shadowBlur = 0;
            if ((data?.stackDepth ?? 1) >= 2) {
              ctx.fillStyle = `rgba(250, 204, 21, ${0.75 * t})`;
              ctx.font = "bold 13px Nunito, system-ui, sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "bottom";
              ctx.fillText("★ 合体 ★", 0, -h / 2 - 8);
            }
            ctx.restore();
          }

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
            w,
            h,
          );
          continue;
        }
        if (body.label === LABEL_ENEMY) {
          const ed = body.plugin.puddingEnemy as EnemyData | undefined;
          const ek = ed?.kind ?? "grunt";
          const ew = ed?.displayW ?? 34;
          const eh = ed?.displayH ?? 40;
          drawEnemyCasual(ctx, body, ek, ew, eh);
          if (ed) {
            const t = ed.hp / (ed.maxHp > 0 ? ed.maxHp : ENEMY_HP);
            drawHealthBarPill(
              ctx,
              body.position.x,
              body.position.y - eh / 2 - 4,
              Math.min(42, ew + 4),
              Math.max(0, t),
              "foe",
            );
          }
          this.drawEnemyEyes(ctx, body, puddingBodies, now, ew, eh);
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

    drawGameOverBanner(
      ctx,
      this.gameOver ? "基地被攻破 — 刷新页面重开" : "",
      wh,
    );

    ctx.restore();
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
    displayW?: number,
    displayH?: number,
  ): void {
    const w =
      displayW ?? self.bounds.max.x - self.bounds.min.x;
    const h =
      displayH ?? self.bounds.max.y - self.bounds.min.y;
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
    displayW?: number,
    displayH?: number,
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
      displayW,
      displayH,
    );
  }

  private drawEnemyEyes(
    ctx: CanvasRenderingContext2D,
    self: Matter.Body,
    puddings: Matter.Body[],
    now: number,
    displayW: number,
    displayH: number,
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
      gazeWorld = { x: WIDTH / 2, y: this.worldGroundY - 36 };
    }

    this.drawCharacterEyes(
      ctx,
      self,
      gazeWorld,
      now,
      {
        white: "#fffbeb",
        rim: "#78350f",
        pupil: "#422006",
      },
      0,
      displayW,
      displayH,
    );
  }
}
