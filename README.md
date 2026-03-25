# PuddingGame

基于 Web（Vite + TypeScript + Matter.js）的 2D 物理堆叠塔防原型：吊机移动、老虎机 Roll、三格取货、合法着地区随吊机移动、双侧波次敌人。界面为柔和马卡龙休闲风；画布渐变天空、草地与果冻感方块绘制集中在 `src/game/canvasArt.ts`。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端里提示的本地地址即可。

## 操作

- **A / D** 或 **← / →**：移动吊机（合法绿色区域随之平移）
- **空格**：抓取或释放吊机附近的布丁积木
- **老虎机 Roll**：消耗费用，随机三个布丁类型
- **取出**：对某一格再付费用，积木挂到吊机绳上

绿色区域内布丁落到地面会保留；红区内落地会被销毁。

**手机 / 触屏**：在画布上左右拖动可平移吊机；底部有 ◀ / ▶ 与「抓取」按钮（窄屏或触控设备上显示）。

## 构建

```bash
npm run build
npm run preview
```

## 数值

可在 `src/game/config.ts` 中调整费用、射速、射程高度加成、波次间隔等。

平衡思路简述：被动收入保证无生产者也能在约 1 分钟内完成首次 Roll+取货；首波前有短准备时间；敌人数量每 4 波每侧 +1，生命按波次缓慢指数成长；基地生命与敌人啃咬伤害略作缓冲，避免两三只同时贴脸瞬间崩盘。

## GitHub Pages

1. 仓库 **Settings → Pages**：**Build and deployment** 的 **Source** 选 **GitHub Actions**。
2. 将包含本工作流的提交合并进 **`main`** 分支（或手动运行 **Actions → Deploy to GitHub Pages → Run workflow**）。
3. 部署完成后，游戏地址一般为：`https://<你的用户名>.github.io/PuddingGame/`（仓库名区分大小写时请与 GitHub 上实际仓库名一致）。

本地若要模拟线上路径，可执行：

```bash
VITE_BASE_PATH=/PuddingGame/ npm run build && npm run preview
```
