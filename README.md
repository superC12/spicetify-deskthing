# Spicetify for DeskThing

Turn your Spotify Car Thing into a third screen for [Spicetify](https://spicetify.app): what's playing, synced lyrics (romanized for Japanese, Korean and Chinese), your queue, your playlists and your PC's stats.

Two pieces work together:

- **Spicetify app for [DeskThing](https://deskthing.app)**: the screens on the Car Thing.
- **DeskThing Bridge**: a Spicetify extension that connects Spotify on your PC to that app.

## ✨ Features

- **Home.** Everything on one screen:
  - the time and date from your PC;
  - the cover, song and artist;
  - synced lyrics that follow the song (tap a line to jump to it), shown as written, romanized or both;
  - one line with the weather plus your PC's CPU use, RAM use and GPU temperature;
  - a control bar with like, previous, play / pause, next, shuffle (including smart shuffle), repeat, the lyrics switch and full screen on your PC.
- **Up next.** Your queue. Tap a song to play it.
- **Playlists.** Your library as a grid. Tap one to play it.
- **Player strip** at the bottom of Up next and Playlists: cover, song, progress, like, previous, play / pause and next.
- **Colours from the cover**, matching the [Juxtaposed](https://github.com/superC12/spicetify-juxtaposed) theme.
- **Full screen on your PC** opens the [Lyrics Plus (Juxtaposed Edition)](https://github.com/superC12/spicetify-lyrics-plus-juxtaposed) full screen.
- **Car Thing controls while the app is open:**

  | Control | Does |
  | --- | --- |
  | Knob | Volume on Home. On Up next and Playlists it scrolls |
  | Knob press | Play / pause |
  | Top buttons 1–3 | Home, Up next, Playlists |
  | Top button 4 | Previous song |
  | Top button 5 | Next song |
  | Swipe left / right | Next or previous page |

## 📦 Install

You need DeskThing set up on your Car Thing and Spicetify on your PC.

### 1. The DeskThing app

1. Download `spicetify-deskthing-v0.2.2.zip` from the [latest release](https://github.com/superC12/spicetify-deskthing/releases/latest).
2. In DeskThing on your PC, open **Downloads → App** and load the zip from file. Acknowledge the **Insecure App** warning (the app isn't from DeskThing's store), then click **Initialize App**.
3. To show the weather, open the app's settings in DeskThing and enter your US ZIP code under **Weather ZIP code**.
4. Updating from an older version: after loading the new zip, quit DeskThing fully once (tray icon → Quit) and open it again. From v0.2.2 on, a reloaded app takes over from the old copy by itself.

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

The bridge reads Spotify's player state, lyrics (from Spotify, then [LRCLIB](https://lrclib.net)), queue and library, and runs the app's commands. The app is DeskThing's music source and fetches cover art on the PC, because the Car Thing has no internet of its own.

- **Weather** comes from [Open-Meteo](https://open-meteo.com) (free, no account), refreshed every 15 minutes, for the US ZIP code you enter in DeskThing under the app's settings (**Weather ZIP code**; turned into a location once with [Zippopotam.us](https://www.zippopotam.us)). Leave it empty and there's no weather. The temperature is in °F.
- **PC stats:** CPU and RAM come from the system; the GPU temperature comes from NVIDIA's `nvidia-smi`, in °C, and is left out on PCs without an NVIDIA card. Windows doesn't expose the CPU temperature without a separate monitoring tool, so it isn't shown.
- Apart from the weather lookup, nothing leaves your PC.

To build the app yourself: `cd deskthing-app`, `npm install`, `npm run build`. The zip lands in `deskthing-app/dist`.

> [!NOTE]
> Built for DeskThing 0.11 and Spotify 1.3.5 with Spicetify 2.45.3. This is a fan project, not affiliated with Spotify, DeskThing or the Spicetify team.

## 📋 Changelog

### v0.2.2

- New **Home** tab with the clock, weather, PC stats, lyrics and all the controls. The tabs are now Home, Up next and Playlists.
- Clock shows your PC's time; the Car Thing's own clock isn't set.
- Previous, play / pause and next sit together; square playlist tiles; swipes between tabs; top buttons 4 and 5 are previous and next.
- Fixed: the knob also changing DeskThing's volume while scrolling, the knob press sometimes doing nothing, lyrics stuck on "Loading", and every control doing nothing after reloading the app in DeskThing.
- Removed the button that reloaded DeskThing's page.

### v0.2.0

- Initial release.

## License

[MIT](LICENSE)
