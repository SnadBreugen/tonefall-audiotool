# TONEFALL — Audiotool Edition (NEXUS)

Sends Tonefall patterns into an Audiotool project via the [NEXUS SDK](https://developer.audiotool.com/),
in three ways: **MIDI** (note track), **native Tonematrix** (pattern), and **Audio** (rendered loop as a sample).

> Note: Audiotool's Tonematrix is fixed to a major-pentatonic scale, so the native-Tonematrix route
> only reproduces Tonefall faithfully in pentatonic mode. MIDI (any pitch) and Audio are the general routes.

Separate Vite app — the standalone Tonefall page stays as-is. Does **not** run in a preview sandbox;
needs your Audiotool login and runs locally.

## One-time setup

App is already registered (Client ID is in `src/config.ts`). Make sure the app's
Redirect URI includes `http://127.0.0.1:5173/` and scope `project:write`.

## Run

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173/** (use 127.0.0.1, not localhost).

1. Click **Login with Audiotool**, approve.
2. Open (or create) a project at https://beta.audiotool.com/ and copy its studio URL.
3. Paste that link into the app and click **Connect** — same as your other integrations.
4. Click **Smoke test** — if a Tonematrix device appears in the project, the pipeline works.

## Status of the transfers

- **Smoke test** — works (documented call).
- **MIDI / Tonematrix / Audio** — scaffolded in `src/tonefall-bridge.ts`. Outer calls are
  documented; the inner details (note events, tonematrix cells, the `insertSample` audio call)
  are `TODO` until confirmed against the entities docs / `nexus-sdk-examples`.

## Next

1. Confirm exact note-event, tonematrix-cell, and `insertSample` signatures.
2. Replace `demoPattern()` with the real Tonefall grid + scale-aware pitch mapping.
3. (Optional, to verify) whether a new project can be created from the app instead of pasting a link.
