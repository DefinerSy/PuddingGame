export const WIDTH = 1200;
export const HEIGHT = 640;

export const GROUND_Y = 580;
export const GROUND_THICK = 50;

/** 吊机水平移动范围 */
export const CRANE_X_MIN = 120;
export const CRANE_X_MAX = 1080;

/** 合法着地区半宽（随吊机中心移动） */
export const SAFE_HALF_WIDTH = 160;

export const CRANE_HOOK_Y = 100;
export const CRANE_MOVE_SPEED = 5;

export const ROLL_COST = 15;
export const TAKE_COST = 8;
export const REFRESH_COST = 5;

export const START_MONEY = 40;

/** 全局被动产费：与生产者无关，按真实时间每分钟增加的费用（整数结算） */
export const PASSIVE_INCOME_PER_MINUTE = 24;

export const SHOOT_INTERVAL_MS = 900;
export const SHOOT_RANGE_BASE = 180;
export const SHOOT_RANGE_PER_HEIGHT = 1.2;

export const PRODUCER_INTERVAL_MS = 3500;
export const PRODUCER_AMOUNT = 6;

export const DEFENDER_HP = 200;
export const ENEMY_HP = 40;
export const ENEMY_SPEED = 1.2;
export const ENEMY_DAMAGE = 8;
/** 敌人持续接触我方布丁时每秒结算约 60/450 次，单次伤害 */
export const ENEMY_DAMAGE_TO_PUDDING = 5;
export const BASE_MAX_HP = 100;

export const WAVE_INTERVAL_MS = 14000;
export const ENEMIES_PER_SIDE_BASE = 1;

/** 布丁眼珠看向敌人的最大距离（略大于常见射程，便于抬头发现敌人） */
export const PUDDING_EYE_ENEMY_RANGE = 380;
/** 与邻居布丁「对视」的搜索半径 */
export const PUDDING_EYE_NEIGHBOR_RANGE = 145;

/** 敌人眼珠看向最近布丁；超出此距离则看向基地 */
export const ENEMY_EYE_PUDDING_RANGE = 420;

/** 偶尔眨眼：单次闭眼时长与间隔范围（毫秒） */
export const EYE_BLINK_DURATION_MS = 110;
export const EYE_BLINK_GAP_MIN_MS = 1800;
export const EYE_BLINK_GAP_MAX_MS = 4800;
