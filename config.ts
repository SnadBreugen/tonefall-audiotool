// ─────────────────────────────────────────────────────────────────────────────
// App credentials. The Client ID is NOT a secret — safe to hardcode.
// Registered at https://developer.audiotool.com/applications
//   Scope: project:write sample:write
//
// Redirect URI must match EXACTLY what you register. We derive it from the
// current location so the same build works in both places — register BOTH:
//   • http://127.0.0.1:5173/                              (local dev)
//   • https://snadbreugen.github.io/tonefall-audiotool/   (GitHub Pages)
// ─────────────────────────────────────────────────────────────────────────────
export const CLIENT_ID = "dd78167a-6512-4316-832c-c2c98fce728e"

export const REDIRECT_URL = window.location.origin + import.meta.env.BASE_URL