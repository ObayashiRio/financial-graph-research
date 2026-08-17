import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/enterprise-graph-explorer/" : "/",
  build: {
    target: "es2022",
  },
});
