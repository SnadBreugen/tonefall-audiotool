import { audiotool } from "@audiotool/nexus"
import { CLIENT_ID, REDIRECT_URL } from "./config"
import { initGame } from "./game.js"
import { sendAsMidi, sendAsAudio, type SynthType } from "./tonefall-bridge"

const loginEl = document.getElementById("login")!
const appwrapEl = document.getElementById("appwrap")!
const atStatusEl = document.getElementById("atstatus")!
const sendStatusEl = document.getElementById("atsendstatus")!

let at: any = null
let nexus: any = null
let selectedSynth: SynthType = "tonematrix"

const setAtStatus = (s: string, cls = "") => { atStatusEl.textContent = s; atStatusEl.className = cls }
const setSendStatus = (s: string, cls = "") => { sendStatusEl.textContent = s; sendStatusEl.className = cls }

console.log("TONEFALL → Audiotool — build 0.9.2")

function wireSendPanel() {
  // synth selector
  document.querySelectorAll<HTMLButtonElement>("#synthbtns .synth").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll("#synthbtns .synth").forEach((x) => x.classList.remove("on"))
      b.classList.add("on")
      selectedSynth = b.dataset.s as SynthType
    }
  })

  document.getElementById("atMidi")!.onclick = async () => {
    if (!nexus) { setSendStatus("Connect your project first (step 0 above).", "err"); return }
    const tf = (window as any).__tonefall
    const notes = tf?.getLoopNotes?.() ?? []
    try {
      setSendStatus(`Writing MIDI → ${selectedSynth}…`)
      const bpm = tf?.getBpm ? tf.getBpm() : 120
      const n = await sendAsMidi(nexus, notes, selectedSynth, bpm)
      setSendStatus(`✓ ${n} notes written to ${selectedSynth} (tempo ${bpm} BPM).`, "ok")
    } catch (e: any) {
      setSendStatus(`Error: ${e?.message ?? e}`, "err")
      console.error(e)
    }
  }

  document.getElementById("atAudio")!.onclick = async () => {
    if (!nexus || !at) { setSendStatus("Connect your project first (step 0 above).", "err"); return }
    const tf = (window as any).__tonefall
    if (!tf?.renderSendWav && !tf?.renderWavBlob) { setSendStatus("Game not ready.", "err"); return }
    try {
      setSendStatus("Rendering 4-bar loop…")
      const blob = await (tf.renderSendWav ? tf.renderSendWav() : tf.renderWavBlob())
      const ticks = tf.sendDurationTicks ?? (tf.barTicks ?? 15360) * 4
      const bpm = tf.getBpm ? tf.getBpm() : 120
      await sendAsAudio(at, nexus, blob, ticks, bpm, (phase: string) => {
        if (phase === "uploading") setSendStatus("Uploading sample…")
        else if (phase === "processing") setSendStatus("Processing sample (transcoding)…")
        else if (phase === "inserting") setSendStatus("Inserting into project…")
      })
      setSendStatus("✓ 4-bar audio loop inserted (tempo " + (tf.getBpm ? tf.getBpm() : 120) + " BPM).", "ok")
    } catch (e: any) {
      setSendStatus(`Error: ${e?.message ?? e}`, "err")
      console.error(e)
    }
  }
}

function wireConnect() {
  const input = document.getElementById("projectUrl") as HTMLInputElement
  const btn = document.getElementById("connectBtn")!
  btn.onclick = async () => {
    const url = input.value.trim()
    if (!url) { setAtStatus("paste a project link", "err"); return }
    try {
      setAtStatus("connecting…")
      nexus = await at.open(url)
      await nexus.start()
      setAtStatus("connected ✓", "ok")
    } catch (e: any) {
      setAtStatus(`error: ${e?.message ?? e}`, "err")
      console.error(e)
    }
  }
}

async function boot() {
  if (CLIENT_ID.startsWith("REPLACE")) {
    loginEl.hidden = true
    appwrapEl.hidden = false
    setAtStatus("Set CLIENT_ID in src/config.ts first.", "err")
    return
  }

  at = await audiotool({ clientId: CLIENT_ID, redirectUrl: REDIRECT_URL, scope: "project:write sample:write" })

  if (at.status === "unauthenticated") {
    loginEl.hidden = false
    appwrapEl.hidden = true
    ;(document.getElementById("loginBtn") as HTMLButtonElement).onclick = () => at.login()
    return
  }

  // logged in → reveal app, start the game, wire Audiotool
  loginEl.hidden = true
  appwrapEl.hidden = false
  initGame()           // game DOM is now visible, so canvas sizing is correct
  wireConnect()
  wireSendPanel()
}

boot().catch((e: any) => {
  loginEl.hidden = true
  appwrapEl.hidden = false
  setAtStatus(`boot error: ${e?.message ?? e}`, "err")
  console.error(e)
})