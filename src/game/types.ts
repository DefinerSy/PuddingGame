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
}

export interface EnemyData {
  hp: number;
  maxHp: number;
}
