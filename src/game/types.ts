export type BlockKind = "shooter" | "defender" | "producer";

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
  /** 相对单体的功能倍率（≥2 时为完美合并体） */
  powerMult: number;
}

export interface EnemyData {
  hp: number;
  maxHp: number;
}
