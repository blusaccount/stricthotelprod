# Soundboard audio

**Empty on purpose.**

Nine clips used to live here — Vine Boom, El Gato, Reverb Fart, Anatolia, Rizz,
FAHH, Seyuh, Massenhausen and Plug. They were meme sounds taken from the
internet with no licence behind any of them. That is unremarkable among
friends and untenable for a public, commercial site, so they were removed
rather than left as a liability.

## Bringing it back

Nothing else was torn out. The lobby panel, the socket handler
(`server/handlers/soundboard.js`) and the "Drop the Beat" achievement are all
still wired up; the panel simply hides itself while there is nothing to play.

To refill it:

1. Put licensed or self-recorded files in this directory.
2. Add one entry per file to the `SOUNDS` array in `public/soundboard.js`
   (`{ id, emoji, label, file }`).
3. Record the source and licence of each file in `public/credits.html`. Do this
   as you add them, not afterwards — that is exactly how the previous set ended
   up unattributable.

Self-recorded audio needs no licence, only a note saying who recorded it.
