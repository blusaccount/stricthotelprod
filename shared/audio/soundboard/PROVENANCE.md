# Soundboard provenance

**Status: unresolved. This blocks commercial operation.**

Nine clips are served from this directory by `public/soundboard.js`. None of
them has a documented source. Until each one is either cleared, replaced or
removed, the site cannot run commercially — meme audio is routinely lifted from
protected works, and "everyone uses it" is not a licence.

## What the files themselves say

Inspected 2026-07-28. There is no usable metadata in any of them:

| File | Container | Encoder tag | Note |
| --- | --- | --- | --- |
| `anatolia.mp3` | MP3 | LAME | no ID3 tag |
| `elgato.mp3` | MP3 | LAME | no ID3 tag |
| `reverbfart.mp3` | MP3 | LAME | no ID3 tag |
| `vineboom.mp3` | MP3 | LAME | no ID3 tag |
| `fahh.ogg` | Opus | empty vendor string | metadata stripped |
| `massenhausen.ogg` | Opus | empty vendor string | metadata stripped |
| `plug.ogg` | Opus | empty vendor string | metadata stripped |
| `rizz.ogg` | Opus | empty vendor string | metadata stripped |
| `seyuh.ogg` | Opus | empty vendor string | metadata stripped |

Two groups, and the split is suggestive but proves nothing:

- The **MP3s** look like downloaded meme audio. "Vine Boom" in particular is a
  widely recognised sound effect with an identifiable rights holder, and "El
  Gato" is a known meme clip. Treat all four as third-party material until
  shown otherwise.
- The **Opus files** have their vendor string blanked, which is what Discord
  produces when exporting from its soundboard or from a voice recording. Names
  like `massenhausen` and `anatolia` read like private in-jokes. If these were
  recorded by the operator or their friends, they are fine — but that has to be
  stated, not assumed.

## What has to happen per clip

For each file, one of:

1. **Self-recorded** — record who made it and when. Nothing else needed.
2. **Licensed** — record the source, the licence and any required credit, and
   add it to `public/credits.html`.
3. **Neither** — delete the file and its entry in `public/soundboard.js`.

Whoever resolves this should replace this file with the answers rather than
adding to it.
