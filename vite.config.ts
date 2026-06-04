import { defineConfig } from "vite"

// OAuth redirects require 127.0.0.1 (NOT localhost) for local dev.
// `base` is only applied for the production build so the GitHub Pages URL
//   https://snadbreugen.github.io/tonefall-audiotool/
// resolves its assets correctly, while local dev stays at the root path.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/tonefall-audiotool/" : "/",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
}))