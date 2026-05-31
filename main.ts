import { audiotool } from "@audiotool/nexus"
import { CLIENT_ID, REDIRECT_URL } from "./config"
import {
  sendAsMidi,
  sendAsAudio,
  patternToNotes,
  type Pattern,
  type SynthType,
} from "./tonefall-bridge"

const statusEl = document.getElementById("status")!
const connectEl = document.getElementById("connect")!
const actionsEl = document.getElementById("actions")!
const loginEl = document.getElementById("login")!
const appuiEl = document.getElementById("appui")!
const setStatus = (s: string) => (statusEl.textContent = s)
console.log("TONEFALL → Audiotool — build 0.3")

let selectedSynth: SynthType = "heisenberg"

// Hardcoded demo pattern to test the pipeline before merging the real game.
// row 0 = top (highest), col = 16th-note step on a 16×16 grid.
function demoPattern(): Pattern {
  return {
    cols: 16,
    rows: 16,
    cells: [
      { col: 0, row: 8 }, { col: 2, row: 6 }, { col: 4, row: 5 }, { col: 6, row: 7 },
      { col: 8, row: 3 }, { col: 10, row: 6 }, { col: 12, row: 4 }, { col: 14, row: 6 },
    ],
  }
}

async function run(label: string, fn: () => Promise<void>) {
  try {
    setStatus(`${label}…`)
    await fn()
    setStatus(`${label}: done ✓`)
  } catch (e: any) {
    setStatus(`${label}: error — ${e?.message ?? e}`)
    console.error(e)
  }
}

function wireActions(nexus: any) {
  // synth selector
  document.querySelectorAll<HTMLButtonElement>(".synth").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".synth").forEach((x) => x.classList.remove("on"))
      b.classList.add("on")
      selectedSynth = b.dataset.s as SynthType
    }
  })

  document.getElementById("sendMidi")!.onclick = () =>
    run(`Send as MIDI → ${selectedSynth}`, () =>
      sendAsMidi(nexus, patternToNotes(demoPattern()), selectedSynth),
    )
  document.getElementById("sendAudio")!.onclick = () =>
    run("Send as Audio", () => sendAsAudio(nexus))

  window.addEventListener("beforeunload", () => { nexus.stop?.() })
}

function showConnect(at: any) {
  setStatus("Logged in. Paste an Audiotool project link, then Connect.")
  connectEl.hidden = false
  const input = document.getElementById("projectUrl") as HTMLInputElement
  const btn = document.getElementById("connectBtn")!
  btn.onclick = async () => {
    const url = input.value.trim()
    if (!url) { setStatus("Paste a project link first."); return }
    try {
      setStatus("Opening project…")
      const nexus = await at.open(url)
      await nexus.start()
      setStatus("Connected. Add a synth in Audiotool, pick it below, then Send.")
      connectEl.hidden = true
      actionsEl.hidden = false
      wireActions(nexus)
    } catch (e: any) {
      setStatus(`Connect error — ${e?.message ?? e}`)
      console.error(e)
    }
  }
}

async function boot() {
  if (CLIENT_ID.startsWith("REPLACE")) {
    appuiEl.hidden = false
    setStatus("Set CLIENT_ID in src/config.ts first.")
    return
  }
  const at = await audiotool({ clientId: CLIENT_ID, redirectUrl: REDIRECT_URL, scope: "project:write" })

  if (at.status === "unauthenticated") {
    loginEl.hidden = false
    appuiEl.hidden = true
    ;(document.getElementById("loginBtn") as HTMLButtonElement).onclick = () => at.login()
    return
  }

  loginEl.hidden = true
  appuiEl.hidden = false
  showConnect(at)
}

boot().catch((e: any) => {
  setStatus(`Boot error — ${e?.message ?? e}`)
  console.error(e)
})
