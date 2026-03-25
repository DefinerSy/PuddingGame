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

/**
 * 经济（偏紧：无生产者时首次 Roll+取出约需 35～50s 被动积累）
 * - Roll(18)+取(9)=27；开局 30 先 Roll 后需再攒 9 费
 * - 被动 14/分 → 约 39s 凑满 9
 */
export const ROLL_COST = 18;
export const TAKE_COST = 9;
export const START_MONEY = 30;
/** 全局被动产费：与生产者无关，按真实时间每分钟增加的费用（整数结算） */
export const PASSIVE_INCOME_PER_MINUTE = 14;

/**
 * 射手（推演：地面射手约 3 发打死第 1 波敌人；叠高后射程覆盖侧翼）
 * - 间隔 820ms，弹伤 13，敌基础生命 40 → ceil(40/13)=4 发 ≈ 3.3s（略紧，鼓励高度/多射手）
 */
export const SHOOT_INTERVAL_MS = 820;
export const SHOOT_RANGE_BASE = 198;
export const SHOOT_RANGE_PER_HEIGHT = 1.12;
export const BULLET_DAMAGE = 13;

/**
 * 生产者：约 4s +5，折合约 75/分，仍明显高于被动但不再滚雪球过快
 */
export const PRODUCER_INTERVAL_MS = 4000;
export const PRODUCER_AMOUNT = 5;

/** 布丁最大生命（createPuddingBody 内使用） */
export const SHOOTER_HP = 68;
export const PRODUCER_BLOCK_HP = 72;
export const DEFENDER_HP = 220;

/** 敌人：基础生命；每波指数成长略缓，避免后期指数爆炸 */
export const ENEMY_HP = 40;
export const ENEMY_HP_WAVE_MULT = 1.055;
export const ENEMY_SPEED = 1.08;
/** 敌人啃基地：略降单次伤害、略提基地血，给 2～3 只同时贴脸时的反应时间 */
export const ENEMY_DAMAGE = 7;
/** 敌人持续接触我方布丁时约每 450ms 结算一次 */
export const ENEMY_DAMAGE_TO_PUDDING = 4;
export const BASE_MAX_HP = 128;

/**
 * 波次：间隔略拉长；每侧数量每 4 波 +1（比原先每 3 波 +1 更温和）
 * 首波前等待 WAVE_START_DELAY_MS，避免开局尚未摆块就刷怪
 */
export const WAVE_INTERVAL_MS = 16500;
export const WAVE_START_DELAY_MS = 5000;
export const ENEMIES_PER_SIDE_BASE = 1;
export const ENEMIES_COUNT_SCALE_EVERY = 4;

/** 布丁眼珠看向敌人的最大距离（略大于常见射程，便于抬头发现敌人） */
export const PUDDING_EYE_ENEMY_RANGE = 400;
/** 与邻居布丁「对视」的搜索半径 */
export const PUDDING_EYE_NEIGHBOR_RANGE = 145;

/** 敌人眼珠看向最近布丁；超出此距离则看向基地 */
export const ENEMY_EYE_PUDDING_RANGE = 420;

/** 偶尔眨眼：单次闭眼时长与间隔范围（毫秒） */
export const EYE_BLINK_DURATION_MS = 110;
export const EYE_BLINK_GAP_MIN_MS = 1800;
export const EYE_BLINK_GAP_MAX_MS = 4800;

/** 布丁 Q 弹：弹簧刚度（越大回弹越快）与阻尼 */
export const PUDDING_JIGGLE_SPRING = 420;
export const PUDDING_JIGGLE_DAMPING = 14;
/** 单次碰撞注入速度上限（视觉弹簧） */
export const PUDDING_JIGGLE_IMPULSE_CAP = 2.8;
/** 相对法向速度低于此忽略，避免抖动 */
export const PUDDING_JIGGLE_IMPACT_THRESHOLD = 0.22;
/** 静止时呼吸摆动角速度（弧度/秒） */
export const PUDDING_IDLE_WOBBLE_SPEED = 2.4;
export const PUDDING_IDLE_WOBBLE_AMP = 0.028;
/** 被抓取时绳子轻摆（弧度） */
export const PUDDING_HELD_SWAY_AMP = 0.07;
