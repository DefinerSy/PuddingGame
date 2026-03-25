import {
  ENEMY_DAMAGE,
  ENEMY_DAMAGE_TO_PUDDING,
  ENEMY_HP,
  ENEMY_HP_WAVE_MULT,
  ENEMY_SPEED,
} from "./config";
import type { EnemyData, EnemyKind } from "./types";

export interface EnemyKindDef {
  hpMul: number;
  speedMul: number;
  damageToBase: number;
  damageToPudding: number;
  w: number;
  h: number;
  density: number;
  frictionAir: number;
}

export const ENEMY_KIND_DEFS: Record<EnemyKind, EnemyKindDef> = {
  runner: {
    hpMul: 0.62,
    speedMul: 1.48,
    damageToBase: 5,
    damageToPudding: 3,
    w: 30,
    h: 36,
    density: 0.0018,
    frictionAir: 0.015,
  },
  grunt: {
    hpMul: 1,
    speedMul: 1,
    damageToBase: ENEMY_DAMAGE,
    damageToPudding: ENEMY_DAMAGE_TO_PUDDING,
    w: 34,
    h: 40,
    density: 0.002,
    frictionAir: 0.02,
  },
  brute: {
    hpMul: 2.35,
    speedMul: 0.68,
    damageToBase: 12,
    damageToPudding: 8,
    w: 46,
    h: 46,
    density: 0.0035,
    frictionAir: 0.028,
  },
  rusher: {
    hpMul: 1.12,
    speedMul: 1.82,
    damageToBase: 9,
    damageToPudding: 6,
    w: 32,
    h: 38,
    density: 0.0019,
    frictionAir: 0.014,
  },
};

/** 与旧版小兵脚底对齐：中心 y = GROUND_Y - 30 - h/2 */
export function enemySpawnCenterY(groundY: number, h: number): number {
  return groundY - 30 - h / 2;
}

export function pickEnemyKind(wave: number): EnemyKind {
  const r = Math.random();
  if (wave <= 2) {
    if (r < 0.2) return "runner";
    return "grunt";
  }
  if (wave <= 4) {
    if (r < 0.24) return "runner";
    if (r < 0.14) return "brute";
    return "grunt";
  }
  if (wave <= 8) {
    if (r < 0.16) return "runner";
    if (r < 0.22) return "brute";
    if (r < 0.12) return "rusher";
    return "grunt";
  }
  if (r < 0.14) return "runner";
  if (r < 0.26) return "brute";
  if (r < 0.2) return "rusher";
  return "grunt";
}

export function computeEnemyMaxHp(kind: EnemyKind, wave: number): number {
  const def = ENEMY_KIND_DEFS[kind];
  return (
    ENEMY_HP *
    def.hpMul *
    ENEMY_HP_WAVE_MULT ** Math.max(0, wave - 1)
  );
}

export function createEnemyPluginData(
  kind: EnemyKind,
  wave: number,
): EnemyData {
  const def = ENEMY_KIND_DEFS[kind];
  const maxHp = computeEnemyMaxHp(kind, wave);
  return {
    hp: maxHp,
    maxHp,
    kind,
    moveSpeed: ENEMY_SPEED * def.speedMul,
    damageToBase: def.damageToBase,
    damageToPudding: def.damageToPudding,
    displayW: def.w,
    displayH: def.h,
  };
}
