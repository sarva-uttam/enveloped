# `sample-test-tone.wav`

A fully synthesized 2-second, 432Hz sine tone with a linear fade-in/
fade-out envelope, generated programmatically (no recording, no sample,
no copyrighted source of any kind) — see the generation script recorded
in `PROJECT_STATUS.md`'s Stage 7 section for the exact code used to
produce it.

**Purpose:** a safe, license-free local test fixture for the invitation
audio player (`src/components/experience/AudioPlayer.tsx`) — used only
by `demo-platinum` (`src/lib/demo-invites.ts`) and this project's own
tests, so the play/pause/loading/ended/error states have something real
to exercise locally without needing a real song.

**Not for production use.** A real invitation's music must be a track
the owner/client genuinely holds the rights to use (see
`PROJECT_STATUS.md`'s Stage 7 section, "Music configuration and
licensing responsibility") — this file is not that, and is not
referenced by any production content path.
