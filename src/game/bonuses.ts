import type { BonusPickId } from "./types";

export const ALL_BONUS_IDS: BonusPickId[] = [
  "shooter_rapid_light",
  "defender_tank_heavy",
  "producer_slow_rich",
  "passive_income_up",
  "base_chip_reduce",
  "shop_discount",
];

export const BONUS_UI: Record<
  BonusPickId,
  { title: string; desc: string; emoji: string }
> = {
  shooter_rapid_light: {
    emoji: "🏹",
    title: "疾射轻弹",
    desc: "射手攻速翻倍，单发伤害降低",
  },
  defender_tank_heavy: {
    emoji: "🛡️",
    title: "重装壁垒",
    desc: "防御布丁生命更高，更耐啃咬",
  },
  producer_slow_rich: {
    emoji: "💰",
    title: "厚积慢产",
    desc: "生产者间隔变长，单次产出更多",
  },
  passive_income_up: {
    emoji: "🪙",
    title: "零花钱",
    desc: "全局被动收入提高",
  },
  base_chip_reduce: {
    emoji: "🏠",
    title: "基地缓冲",
    desc: "敌人对基地每次伤害减少（至少仍扣 1）",
  },
  shop_discount: {
    emoji: "🎰",
    title: "批发价",
    desc: "老虎机与取出费用降低",
  },
};

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/** 从六种中随机抽三种供玩家选择 */
export function pickThreeBonuses(): BonusPickId[] {
  const pool = [...ALL_BONUS_IDS];
  shuffleInPlace(pool);
  return pool.slice(0, 3);
}
