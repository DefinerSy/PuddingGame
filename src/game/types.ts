export type BlockKind = "shooter" | "defender" | "producer";

export interface PuddingData {
  kind: BlockKind;
  hp: number;
  maxHp: number;
  shootAccumulator: number;
  produceAccumulator: number;
}

export interface EnemyData {
  hp: number;
  maxHp: number;
}
