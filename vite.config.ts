import { defineConfig } from "vite";

/** GitHub Pages 项目站为 /<仓库名>/；本地不设环境变量时用 "/" */
const base =
  process.env.VITE_BASE_PATH?.replace(/\/?$/, "/") ||
  "/";

export default defineConfig({
  root: ".",
  publicDir: "public",
  base,
});
