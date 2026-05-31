import { defineConfig } from "vite"

// OAuth redirects require 127.0.0.1 (NOT localhost) — must match the redirect URI
// you register for your app on developer.audiotool.com/applications
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
})
