// ─────────────────────────────────────────────────────────────────────────────
// App credentials. The Client ID is NOT a secret — safe to hardcode.
// Registered at https://developer.audiotool.com/applications
//   Redirect URI: http://127.0.0.1:5173/   ·   Scope: project:write
// ─────────────────────────────────────────────────────────────────────────────
export const CLIENT_ID = "dd78167a-6512-4316-832c-c2c98fce728e"

// Must match the registered redirect URI and your vite dev host.
export const REDIRECT_URL = "http://127.0.0.1:5173/"

// No project is hardcoded. The user pastes a project link at runtime
// (open/create a project at https://beta.audiotool.com/ and copy its URL),
// exactly like your other integrations.
