export type BlockKind = "shooter" | "defender" | "producer";

/** 敌人种类：后期波次混合刷新加压 */
export type EnemyKind = "runner" | "grunt" | "brute" | "rusher";

export interface PuddingData {
  kind: BlockKind;
  hp: number;
  maxHp: number;
  shootAccumulator: number;
  produceAccumulator: number;
  /** Q 弹形变：弹簧位移（用于 scale） */
  jiggleX: number;
  jiggleV: number;
  /** 静止呼吸相位的累积角 */
  idlePhase: number;
  /** 由几次合并计数的单体层数，1=普通块 */
  stackDepth: number;
  /** 防御者合体：耐啃倍率；射手/生产者合体时与射程或产费倍率对齐 */
  powerMult: number;
  /** 射手合体：基础射程倍率（攻速不变，多发弹道） */
  mergeRangeMul: number;
  mergeProjectileCount: number;
  /** 生产者合体：单次产费倍率（间隔不变） */
  mergeProducerGainMul: number;
  /** 绘制用固定局部宽高（不倒翁时 AABB 会变，此值与物理外形一致） */
  displayW: number;
  displayH: number;
}

export interface EnemyData {
  hp: number;
  maxHp: number;
  kind: EnemyKind;
  /** 水平移速（与 ENEMY_SPEED 相乘后的实际值） */
  moveSpeed: number;
  damageToBase: number;
  damageToPudding: number;
  displayW: number;
  displayH: number;
}
