# Spicetify for DeskThing

Turn your Spotify Car Thing into a third screen for [Spicetify](https://spicetify.app): what's playing, synced lyrics (romanized for Japanese, Korean and Chinese), your queue, your playlists and your PC's stats.

Two pieces work together:

- **Spicetify app for [DeskThing](https://deskthing.app)**: the screens on the Car Thing.
- **DeskThing Bridge**: a Spicetify extension that connects Spotify on your PC to that app.

## ✨ Features

- **Now playing.** Big cover, title, artist and the current lyric line, with shuffle (including smart shuffle), previous, repeat and full screen on your PC.
- **Lyrics.** Synced lyrics that follow the song. Tap a line to jump to it. Shown as written, romanized or both.
- **Up next.** Your queue. Tap a song to play it.
- **Playlists.** Your library as a grid. Tap one to play it.
- **PC.** A big clock, CPU and memory use, and buttons that open full screen, the mini player or the lyrics page on your PC (with [Lyrics Plus (Juxtaposed Edition)](https://github.com/superC12/spicetify-lyrics-plus-juxtaposed)).
- **Player strip** at the bottom of every page: cover, song, progress, like, play / pause and next.
- **Colours from the cover**, matching the [Juxtaposed](https://github.com/superC12/spicetify-juxtaposed) theme.
- **Car Thing controls while the app is open:**

  | Control | Does |
  | --- | --- |
  | Knob | Volume. On Lyrics, Up next and Playlists it scrolls |
  | Knob press | Play / pause |
  | Top buttons 1–4 | Now playing, Lyrics, Up next, Playlists |
  | Swipe left / right | Next or previous page |

## 📦 Install

You need DeskThing set up on your Car Thing and Spicetify on your PC.

### 1. The DeskThing app

1. Download `spicetify-deskthing-v0.2.0.zip` from the [latest release](https://github.com/superC12/spicetify-deskthing/releases/latest).
2. In DeskThing on your PC, open **Downloads → App** and load the zip from file. Acknowledge the **Insecure App** warning (the app isn't from DeskThing's store), then click **Initialize App**.

### 2. The DeskThing Bridge extension

1. Download [`bridge/deskthingBridge.js`](bridge/deskthingBridge.js) into your Spicetify `Extensions` folder (`%appdata%\spicetify\Extensions\` on Windows, `~/.config/spicetify/Extensions/` on Linux and macOS).
2. Run:

   ```
   spicetify config extensions deskthingBridge.js
   spicetify apply
   ```

Restart Spotify and open the Spicetify app on your Car Thing.

## 💡 How it works

```
Spotify + Spicetify ── DeskThing Bridge ──ws://127.0.0.1:8892──▶ Spicetify app (DeskThing) ──USB──▶ Car Thing
```

The bridge reads Spotify's player state, lyrics (from Spotify, then [LRCLIB](https://lrclib.net)), queue and library, and runs the app's commands. The app is DeskThing's music source and fetches cover art on the PC, because the Car Thing has no internet of its own. Nothing leaves your PC.

To build the app yourself: `cd deskthing-app`, `npm install`, `npm run build`. The zip lands in `deskthing-app/dist`.

> [!NOTE]
> Built for DeskThing 0.11 and Spotify 1.3.5 with Spicetify 2.45.3. This is a fan project, not affiliated with Spotify, DeskThing or the Spicetify team.

## 📋 Changelog

### v0.2.0

- Initial release.

## License

[MIT](LICENSE)
