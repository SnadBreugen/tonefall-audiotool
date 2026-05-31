// ─────────────────────────────────────────────────────────────────────────────
// Tonefall → Audiotool transfer.
//  • MIDI: proven note-writing pattern (Matrix Evolutions): find the user's synth,
//    write noteCollection + noteRegion + individual notes into its track.
//  • Audio: upload the rendered WAV as a sample, WAIT for processing (upload.ready),
//    then insertSample with the finished SampleMeta (auto-creates audio device+track).
// ─────────────────────────────────────────────────────────────────────────────

export type SynthType = "heisenberg" | "pulverisateur" | "space" | "bassline"

export type NoteCell = {
  pitch: number
  positionTicks: number
  durationTicks: number
  velocity: number
}

// ── MIDI ─────────────────────────────────────────────────────────────────────
export async function sendAsMidi(nexus: any, notes: NoteCell[], synthType: SynthType, bpm: number) {
  if (!notes.length) throw new Error("No notes — play and Hold a loop first.")
  const synths = nexus.queryEntities.ofTypes(synthType).get()
  if (!synths.length) {
    throw new Error(`No ${synthType} found — add one in Audiotool first.`)
  }
  const synth = synths[0]

  await nexus.modify((t: any) => {
    // Match the project tempo to the Tonefall speed so the 16th-note grid plays
    // at the same speed you heard in the game.
    const cfg = nexus.queryEntities.ofTypes("config").get()[0]
    if (cfg && cfg.fields?.tempoBpm) t.update(cfg.fields.tempoBpm, bpm)

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
        durationTicks: 15360,        // one bar (Ticks.SemiBreve)
        loopDurationTicks: 15360,
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
  return notes.length
}

// ── Audio ──────────────────────────────────────────────────────────────────────
// onPhase lets the UI report progress ("uploading" → "processing" → "inserting").
export async function sendAsAudio(
  at: any,
  nexus: any,
  wavBlob: Blob,
  musicDurationTicks: number,
  bpm: number,
  onPhase?: (p: string) => void,
) {
  onPhase?.("uploading")
  const upload = await at.samples.upload({
    file: wavBlob,
    displayName: "Tonefall loop",
    kind: "loop",
    tags: ["tonefall"],
  })
  if (upload instanceof Error) throw upload

  const uploadErr = await upload.uploaded
  if (uploadErr instanceof Error) throw uploadErr

  // Wait for server-side processing so the sample is actually loadable
  // (otherwise it shows up but won't load until a project reload).
  onPhase?.("processing")
  const meta = await upload.ready
  if (meta instanceof Error) throw meta

  onPhase?.("inserting")
  // Reuse an existing audio track/device so the sample isn't dumped at a random
  // spot on the desktop; only auto-create if the project has none yet.
  const tracks = nexus.queryEntities.ofTypes("audioTrack").get()
  const devices = nexus.queryEntities.ofTypes("audioDevice").get()
  const attachTo = tracks[0] || devices[0] || undefined

  await nexus.modify((t: any) => {
    // Match project tempo to the game speed so the 4-bar loop sits without stretch.
    const cfg = nexus.queryEntities.ofTypes("config").get()[0]
    if (cfg && cfg.fields?.tempoBpm) t.update(cfg.fields.tempoBpm, bpm)

    t.insertSample(meta, {
      sample: { musicDurationTicks }, // exact 4-bar length → no stretch, in tempo
      region: { positionTicks: 0, durationTicks: musicDurationTicks },
      loop: true,
      ...(attachTo ? { attachTo } : {}),
    })
  })
  return meta.name
}