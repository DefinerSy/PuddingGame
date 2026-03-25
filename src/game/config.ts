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
 * 经济：开局宽松；每从商店**成功取出**一个方块，Roll/取出各涨一档（有上限），整局累加、Roll 不清零。
 */
export const ROLL_COST_BASE = 16;
export const TAKE_COST_BASE = 8;
/** 每买过 1 个方块后，下次 Roll / 单次取出各加的整数费 */
export const ROLL_COST_PER_BLOCK_PURCHASED = 2;
export const TAKE_COST_PER_BLOCK_PURCHASED = 1;
export const ROLL_COST_MAX = 48;
export const TAKE_COST_MAX = 22;
export const START_MONEY = 38;
/** 全局被动产费：与生产者无关，按真实时间每分钟增加的费用（整数结算） */
export const PASSIVE_INCOME_PER_MINUTE = 12;

/**
 * 射手（推演：地面射手约 3 发打死第 1 波敌人；叠高后射程覆盖侧翼）
 * - 间隔 820ms，弹伤 13，敌基础生命 40 → ceil(40/13)=4 发 ≈ 3.3s（略紧，鼓励高度/多射手）
 */
export const SHOOT_INTERVAL_MS = 820;
export const SHOOT_RANGE_BASE = 198;
export const SHOOT_RANGE_PER_HEIGHT = 1.12;
export const BULLET_DAMAGE = 13;

/**
 * 生产者：略慢略少，配合波次涨价，后期不会无限囤费
 */
export const PRODUCER_INTERVAL_MS = 4500;
export const PRODUCER_AMOUNT = 4;

/** 布丁最大生命（createPuddingBody 内使用） */
export const SHOOTER_HP = 68;
export const PRODUCER_BLOCK_HP = 72;
export const DEFENDER_HP = 220;

/** 敌人：基础生命；每波指数成长；具体种类另有倍率 */
export const ENEMY_HP = 40;
export const ENEMY_HP_WAVE_MULT = 1.055;
export const ENEMY_SPEED = 1.08;
/** 无种类数据时的默认啃咬（grunt） */
export const ENEMY_DAMAGE = 7;
export const ENEMY_DAMAGE_TO_PUDDING = 4;
export const BASE_MAX_HP = 128;

/**
 * 基地自卫：开局无射手时仍能清近身敌人（弱于射手布丁，不占方块位）
 */
export const BASE_DEFENSE_INTERVAL_MS = 1050;
export const BASE_DEFENSE_RANGE = 268;
export const BASE_DEFENSE_DAMAGE = 8;

/** 基地升级：每级增加天空高度、吊机更高、敌人生成更远、镜头略拉远 */
export const BASE_UPGRADE_MAX_LEVEL = 4;
export const BASE_UPGRADE_COST_BASE = 95;
export const BASE_UPGRADE_COST_PER_LEVEL = 55;
/** 每级世界向上扩展的像素（地面与天空整体上移等效：地面 y 下移） */
export const BASE_UPGRADE_SKY_EXTRA = 110;
/** 每级吊机挂钩上移 */
export const BASE_UPGRADE_HOOK_LIFT = 48;
/** 每级敌人生成距边界的额外距离 */
export const BASE_UPGRADE_SPAWN_PUSH = 26;
/** 每级在「适配高度」基础上的额外缩放（<1 拉远） */
export const BASE_UPGRADE_VIEW_ZOOM_MUL = 0.965;

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

/** 《都市摩天楼》式完美叠放：同类上下对齐合并为更高一体块 */
export const MERGE_ALIGN_MAX_PX = 22;
export const MERGE_MAX_ANGLE_RAD = 0.22;
/** 上块底边与下块顶边的穿透/间隙（像素，y 向下为正）；略负允许微小缝 */
export const MERGE_FACE_GAP_MIN = -10;
export const MERGE_FACE_GAP_MAX = 36;
/** 水平投影重叠至少占较窄块宽度的比例 */
export const MERGE_MIN_HORIZONTAL_OVERLAP_FRAC = 0.42;
export const MERGE_POWER_BASE = 2.5;
/** 合并层数上限（由多个单体堆成） */
export const MERGE_MAX_STACK_DEPTH = 12;
/** 合体射手最多同时发射的子弹数 */
export const MERGE_MAX_PROJECTILES = 8;
/** 多发弹道扇形半角（弧度） */
export const MERGE_MULTI_SHOT_SPREAD_RAD = 0.14;

/** 每 N 波额外出现 1 只携带宝箱的敌人（左右交替） */
export const CHEST_CARRIER_WAVE_EVERY = 5;
/** 掉落宝箱尺寸与寿命 */
export const CHEST_BOX_W = 34;
export const CHEST_BOX_H = 28;
export const CHEST_LIFETIME_MS = 45000;

/** 宝箱加成数值（可叠乘：同类再选一层再乘一次） */
export const BONUS_SHOOTER_INTERVAL_MUL = 0.5;
export const BONUS_SHOOTER_DMG_MUL = 0.65;
export const BONUS_DEFENDER_HP_MUL = 1.35;
export const BONUS_DEFENDER_CHIP_TAKEN_MUL = 0.72;
export const BONUS_PRODUCER_INTERVAL_MUL = 1.55;
export const BONUS_PRODUCER_GAIN_MUL = 1.45;
export const BONUS_PASSIVE_INCOME_MUL = 1.3;
export const BONUS_BASE_DAMAGE_TAKEN_MUL = 0.78;
export const BONUS_SHOP_COST_SUB = 3;
