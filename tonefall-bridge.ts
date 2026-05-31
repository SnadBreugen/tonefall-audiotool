// ─────────────────────────────────────────────────────────────────────────────
// Tonefall → Audiotool, built on the PROVEN note-writing pattern from
// "Matrix Evolutions" (Snad Industries). The app does NOT create devices or
// projects — the user opens a project and adds a synth; we find it and write notes.
// ─────────────────────────────────────────────────────────────────────────────
import { Ticks } from "@audiotool/nexus/utils"

// One bar (4/4). A 16-column Tonefall grid = one bar of 16th notes.
export const BAR_TICKS = Ticks.SemiBreve

export type SynthType = "heisenberg" | "pulverisateur" | "space" | "bassline"

// A lit Tonefall cell: row (0 = top/highest) and col (16th-note step).
export type Pattern = {
  cols: number
  rows: number
  cells: { col: number; row: number }[]
}

// A concrete note event, same shape Matrix Evolutions writes.
export type NoteCell = {
  pitch: number
  positionTicks: number
  durationTicks: number
  velocity: number
}

// ── Pattern → notes ────────────────────────────────────────────────────────
// Placeholder pitch mapping (C minor pentatonic) so the test bench sounds
// musical. When we merge the real game in, this gets replaced by Tonefall's
// own buildScale() so pitches match exactly what you hear in the game.
const PENTA = [0, 3, 5, 7, 10]
export function rowToMidi(rows: number, row: number, base = 48 /* C3 */): number {
  const fromBottom = rows - 1 - row
  const oct = Math.floor(fromBottom / PENTA.length)
  const deg = PENTA[fromBottom % PENTA.length]
  return base + oct * 12 + deg
}

export function patternToNotes(p: Pattern): NoteCell[] {
  const stepTicks = BAR_TICKS / p.cols
  return p.cells.map((c) => ({
    pitch: rowToMidi(p.rows, c.row),
    positionTicks: c.col * stepTicks,
    durationTicks: stepTicks,
    velocity: 0.7,
  }))
}

// ── Send as MIDI ─────────────────────────────────────────────────────────────
// Finds the chosen synth (already placed by the user) and writes the notes into
// its note track — reusing an existing track for that synth or creating one.
export async function sendAsMidi(nexus: any, notes: NoteCell[], synthType: SynthType) {
  const synths = nexus.queryEntities.ofTypes(synthType).get()
  if (!synths.length) {
    throw new Error(`No ${synthType} found in the project — add one in Audiotool first.`)
  }
  const synth = synths[0]

  await nexus.modify((t: any) => {
    const existingTracks = nexus.queryEntities.ofTypes("noteTrack").get()
    const existingTrack = existingTracks.find(
      (tr: any) => JSON.stringify(tr.fields.player?.value) === JSON.stringify(synth.location),
    )
    const trackLocation = existingTrack
      ? existingTrack.location
      : t.create("noteTrack", {
          orderAmongTracks: Math.floor(Math.random() * 100000),
          player: synth.location,
        }).location

    const col = t.create("noteCollection", {})
    t.create("noteRegion", {
      track: trackLocation,
      collection: col.location,
      region: {
        positionTicks: 0,
        durationTicks: BAR_TICKS,
        loopDurationTicks: BAR_TICKS,
        loopOffsetTicks: 0,
        collectionOffsetTicks: 0,
      },
    })

    for (const n of notes) {
      t.create("note", {
        collection: col.location,
        pitch: n.pitch,
        positionTicks: n.positionTicks,
        durationTicks: n.durationTicks,
        velocity: n.velocity,
      })
    }
  })
}

// ── Send as Audio ──────────────────────────────────────────────────────────────
// Insert the rendered loop as a sample (the BandM8-style path). Still to confirm
// the exact InsertSampleOptions / Audiograph signature — not yet wired.
// Safe fallback today: export the WAV from Tonefall and use Audiotool's Sample Upload.
export async function sendAsAudio(_nexus: any, _wavBytes?: Uint8Array) {
  throw new Error("Audio insert not wired yet — use Tonefall's WAV export + Audiotool Sample Upload for now.")
}
