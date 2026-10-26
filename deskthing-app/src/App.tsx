import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DeskThing } from '@deskthing/client'
import { useSpice, useNow, command, progressOf, fmt, activeLine, Spice, Lyrics } from './spice'
import { applyTheme, blurredCover } from './theme'
import * as I from './icons'

const PAGES = ['Home', 'Up next', 'Playlists'] as const
type ScriptMode = 'original' | 'romanized' | 'both'
const NEXT_MODE: Record<ScriptMode, ScriptMode> = { original: 'romanized', romanized: 'both', both: 'original' }

// Two-tone like badge from Lyrics Plus: pink circle with the heart cut out when liked, soft circle otherwise
const LikeBadge: React.FC<{ liked: boolean; size?: number }> = ({ liked, size = 46 }) => (
  <button className={`like ${liked ? 'on' : ''}`} style={{ width: size, height: size }} onClick={() => command({ cmd: 'like' })} aria-label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}>
    <svg viewBox="0 0 24 24" width="100%" height="100%">
      <defs>
        <mask id="cut">
          <rect width="24" height="24" fill="#fff" />
          <path d="M12 18.4l-5.4-5.2a3.4 3.4 0 0 1 4.8-4.8l.6.6.6-.6a3.4 3.4 0 0 1 4.8 4.8z" fill="#000" />
        </mask>
      </defs>
      {liked ? (
        <circle cx="12" cy="12" r="12" fill="#ff5c93" mask="url(#cut)" />
      ) : (
        <>
          <circle cx="12" cy="12" r="12" fill="rgba(255,255,255,.16)" />
          <path d="M12 18.4l-5.4-5.2a3.4 3.4 0 0 1 4.8-4.8l.6.6.6-.6a3.4 3.4 0 0 1 4.8 4.8z" fill="#fff" />
        </>
      )}
    </svg>
  </button>
)

const Toggle: React.FC<{ on: boolean; label: string; onClick: () => void; children: React.ReactNode }> = ({ on, label, onClick, children }) => (
  <button className={`toggle ${on ? 'on' : ''}`} onClick={onClick} aria-label={label} aria-pressed={on}>
    {children}
  </button>
)

const Dots: React.FC<{ page: number; setPage: (n: number) => void }> = ({ page, setPage }) => (
  <div className="dots">
    {PAGES.map((p, i) => (
      <button key={p} className={i === page ? 'on' : ''} onClick={() => setPage(i)} aria-label={p} />
    ))}
  </div>
)

// The PC's local time. The Car Thing's own clock and time zone aren't set, so the PC's clock (sent with the stats)
// is moved on by however long ago it arrived, shifted into the PC's time zone and read back with the UTC getters.
// Formatted by hand: the Car Thing's old browser has little locale data, so toLocale* output comes out odd there.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function pcClock(s: Spice, now: number): { hm: string; ampm: string; date: string } {
  const st = s.stats
  const pcNow = st?.receivedAt != null ? st.time + (now - st.receivedAt) : now
  const utc = st?.tz != null
  const d = utc ? new Date(pcNow + st!.tz! * 60000) : new Date(pcNow)
  const hours = utc ? d.getUTCHours() : d.getHours()
  const minutes = utc ? d.getUTCMinutes() : d.getMinutes()
  return {
    hm: `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}`,
    ampm: hours < 12 ? 'AM' : 'PM',
    date: `${DAYS[utc ? d.getUTCDay() : d.getDay()]}, ${MONTHS[utc ? d.getUTCMonth() : d.getMonth()]} ${utc ? d.getUTCDate() : d.getDate()}`
  }
}

// ------------------------------------------------------------------ pages

// Home: clock, cover and song on the left; weather and PC stats on one line above the lyrics on the right;
// the controls along the bottom-left. Nothing in the top right, where the knob covers the screen.
const Home: React.FC<{
  s: Spice
  now: number
  ms: number
  mode: ScriptMode
  setMode: (m: ScriptMode) => void
  scrollRef: React.RefObject<HTMLDivElement>
  page: number
  setPage: (n: number) => void
}> = ({ s, now, ms, mode, setMode, scrollRef, page, setPage }) => {
  const st = s.state
  const stats = s.stats
  const w = s.weather
  const clock = pcClock(s, now)
  const pct = st?.duration ? Math.min(100, (100 * ms) / st.duration) : 0
  const ram = stats ? Math.round((100 * stats.memUsed) / stats.memTotal) : null
  const hasRoman = !!s.lyrics?.lines.some((l) => l.roman)
  return (
    <div className="home">
      <div className="home-clock">
        {clock.hm}
        <span className="ampm">{clock.ampm}</span>
      </div>
      <div className="home-date">{clock.date}</div>
      {st?.thumbnail ? <img className="home-cover" src={st.thumbnail} alt="" /> : <div className="home-cover" />}
      <div className="home-title">{st?.title || (s.bridge ? 'Nothing playing' : 'Waiting for Spotify…')}</div>
      <div className="home-artist">{st?.artists.join(', ')}</div>

      {/* Weather, then CPU use, RAM use and GPU temperature (Celsius, no unit letter) in grey */}
      <div className="home-info">
        {w && (
          <span className="wx">
            <I.WeatherIcon kind={w.kind} day={w.day} size={24} />
            <span className="wx-text">
              {w.temp}° · {w.label}
            </span>
          </span>
        )}
        {stats && (
          <span className="st">
            <I.Chip size={16} />
            {stats.cpu}%
          </span>
        )}
        {ram != null && (
          <span className="st">
            <I.Ram size={16} />
            {ram}%
          </span>
        )}
        {stats?.gpuTemp != null && (
          <span className="st">
            <I.Therm size={16} />
            {stats.gpuTemp}°
          </span>
        )}
      </div>

      <div className="home-lyrics">
        <LyricsPage lyrics={s.lyrics} ms={ms} mode={mode} scrollRef={scrollRef} />
      </div>

      <div className="home-controls">
        {st && <LikeBadge liked={st.liked} size={46} />}
        <button className="hc" onClick={() => command({ cmd: 'previous' })} aria-label="Previous">
          <I.Prev size={30} />
        </button>
        <button className="hc hc-play" onClick={() => command({ cmd: 'toggle' })} aria-label={st?.playing ? 'Pause' : 'Play'}>
          {st?.playing ? <I.Pause size={28} /> : <I.Play size={28} />}
        </button>
        <button className="hc" onClick={() => command({ cmd: 'next' })} aria-label="Next">
          <I.Next size={30} />
        </button>
        <Toggle on={(st?.shuffle ?? 0) > 0} label="Shuffle" onClick={() => command({ cmd: 'shuffle' })}>
          {st?.shuffle === 2 ? <I.SmartShuffle size={26} /> : <I.Shuffle size={26} />}
        </Toggle>
        <Toggle on={st?.repeat !== 'off' && !!st} label="Repeat" onClick={() => command({ cmd: 'repeat' })}>
          {st?.repeat === 'track' ? <I.RepeatOne size={26} /> : <I.Repeat size={26} />}
        </Toggle>
        <button
          className={`hc hc-script ${hasRoman ? '' : 'off'}`}
          onClick={() => setMode(NEXT_MODE[mode])}
          aria-label={`Lyrics: ${mode === 'original' ? 'as written' : mode === 'romanized' ? 'romanized' : 'both'}`}
        >
          {mode === 'original' ? 'あ' : mode === 'romanized' ? 'A' : 'あA'}
        </button>
        <button className="hc" onClick={() => command({ cmd: 'fullScreen' })} aria-label="Full screen on PC">
          <I.Monitor size={26} />
        </button>
      </div>

      <div className="home-dots">
        <Dots page={page} setPage={setPage} />
      </div>
      <div className="home-progress">
        <div style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  )
}

const LyricsPage: React.FC<{ lyrics: Lyrics | null; ms: number; mode: ScriptMode; scrollRef: React.RefObject<HTMLDivElement> }> = ({ lyrics, ms, mode, scrollRef }) => {
  const idx = activeLine(lyrics, ms)
  const held = useRef(0)
  useEffect(() => {
    const box = scrollRef.current
    const el = box?.querySelector<HTMLElement>(`[data-i="${idx}"]`)
    if (!box || !el || Date.now() < held.current) return
    box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.35, behavior: 'smooth' })
  }, [idx, scrollRef])
  return (
    <div className="lyrics">
      <div className="lyrics-scroll" ref={scrollRef} onPointerDown={() => (held.current = Date.now() + 4000)} onWheel={() => (held.current = Date.now() + 4000)}>
        {!lyrics || lyrics.status === 'loading' ? (
          <div className="empty">Loading lyrics…</div>
        ) : lyrics.status === 'none' ? (
          <div className="empty">No lyrics for this song</div>
        ) : (
          lyrics.lines.map((l, i) => {
            const romanOnly = mode === 'romanized' && l.roman
            return (
              <div
                key={i}
                data-i={i}
                className={`line ${i === idx || !lyrics.synced ? 'active' : ''} ${l.time != null ? 'synced' : ''}`}
                onClick={() => l.time != null && command({ cmd: 'seek', ms: l.time })}
              >
                <div>{romanOnly ? l.roman : l.text || '♪'}</div>
                {l.roman && mode === 'both' && <div className="roman">{l.roman}</div>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const Queue: React.FC<{ s: Spice; scrollRef: React.RefObject<HTMLDivElement>; page: number; setPage: (n: number) => void }> = ({ s, scrollRef, page, setPage }) => (
  <div className="listpage">
    <div className="page-head">
      <div className="page-title">Up next</div>
      <Dots page={page} setPage={setPage} />
    </div>
    <div className="list" ref={scrollRef}>
      {s.queue.length === 0 && <div className="empty">Nothing queued</div>}
      {/* Rows and tiles are divs: the Car Thing's old Chromium can't lay out flex content inside a <button> */}
      {s.queue.map((t, i) => (
        <div key={(t.uid ?? t.uri) + i} className="row" role="button" onClick={() => command({ cmd: 'skipTo', uri: t.uri, uid: t.uid })}>
          {t.image ? <img className="thumb" src={t.image} alt="" /> : <div className="thumb thumb-empty" />}
          <div className="row-text">
            <div className="row-title">{t.title}</div>
            <div className="row-sub">{t.artist}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
)

const Playlists: React.FC<{ s: Spice; scrollRef: React.RefObject<HTMLDivElement>; page: number; setPage: (n: number) => void }> = ({ s, scrollRef, page, setPage }) => (
  <div className="listpage">
    <div className="page-head">
      <div className="page-title">Playlists</div>
      <Dots page={page} setPage={setPage} />
    </div>
    <div className="grid" ref={scrollRef}>
      {s.playlists.length === 0 && <div className="empty">No playlists yet</div>}
      {s.playlists.map((p) => (
        <div key={p.uri} className={`tile ${s.state?.context?.uri === p.uri ? 'playing' : ''}`} role="button" onClick={() => command({ cmd: 'playUri', uri: p.uri })}>
          {p.image ? <img className="tile-art" src={p.image} alt="" /> : <div className="tile-art tile-empty">♪</div>}
          <div className="tile-name">{p.name}</div>
        </div>
      ))}
    </div>
  </div>
)

// ------------------------------------------------------------------ app

const App: React.FC = () => {
  const s = useSpice()
  const now = useNow(500)
  const [page, setPage] = useState(0)
  const [mode, setModeState] = useState<ScriptMode>(() => (localStorage.getItem('spice:script') as ScriptMode) || 'both')
  const setMode = (m: ScriptMode): void => {
    setModeState(m)
    localStorage.setItem('spice:script', m)
  }
  const [volumeHud, setVolumeHud] = useState<number | null>(null)
  const hudTimer = useRef<number>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const st = s.state
  const ms = progressOf(st, now)

  const [bgImage, setBgImage] = useState<string | null>(null)
  useEffect(() => {
    void applyTheme(st?.thumbnail)
    let live = true
    if (st?.thumbnail) void blurredCover(st.thumbnail).then((b) => live && b && setBgImage(b))
    return () => void (live = false)
  }, [st?.thumbnail])

  // The knob changes the volume on Home and scrolls Up next and Playlists. Pressing it plays or pauses.
  // Top buttons 1–3 open the three tabs; button 4 is previous track and the round button to its right is next track.
  const volumeRef = useRef(0)
  const turnedAt = useRef(0)
  const sendTimer = useRef<number>()
  // While the knob is turning, keep our own volume rather than Spotify's slightly older one, so it doesn't jump back
  if (Date.now() - turnedAt.current > 1500) volumeRef.current = st ? (st.muted ? 0 : st.volume) : 0
  const pageRef = useRef(page)
  pageRef.current = page
  useEffect(() => {
    // 'wheel' is the name DeskThing's SDK checks for the knob; without it DeskThing also changed the volume on every turn
    const KEYS = ['wheel', 'Scroll', 'Enter', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyM']
    try {
      DeskThing.overrideKeys(KEYS)
    } catch {}
    const onWheel = (e: WheelEvent): void => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!delta) return
      if (pageRef.current !== 0) {
        const box = scrollRef.current
        if (box) box.scrollTop += Math.sign(delta) * 80
        return
      }
      const v = Math.round(Math.min(1, Math.max(0, volumeRef.current + (delta > 0 ? 0.04 : -0.04))) * 100) / 100
      volumeRef.current = v
      turnedAt.current = Date.now()
      setVolumeHud(v)
      // Send at most every 120 ms; the last position always goes out
      if (!sendTimer.current) {
        command({ cmd: 'volume', value: v })
        sendTimer.current = window.setTimeout(() => {
          sendTimer.current = undefined
          command({ cmd: 'volume', value: volumeRef.current })
        }, 120)
      }
      window.clearTimeout(hudTimer.current)
      hudTimer.current = window.setTimeout(() => setVolumeHud(null), 1200)
    }
    const onKey = (e: KeyboardEvent): void => {
      // The knob press arrives as Enter. Stop the browser also "pressing" whichever button was tapped last
      // (it keeps focus), or play/pause would toggle twice and look like it did nothing.
      if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault()
        e.stopPropagation()
        return command({ cmd: 'toggle' })
      }
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code)
      const k = ['1', '2', '3'].indexOf(e.key)
      const target = n >= 0 ? n : k
      if (target >= 0) return setPage(target)
      // Button 4 is previous track, the round button to its right is next track
      if (e.code === 'Digit4' || e.key === '4') return command({ cmd: 'previous' })
      if (e.code === 'KeyM' || e.code === 'Digit5' || e.key.toLowerCase() === 'm' || e.key === '5') return command({ cmd: 'next' })
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      try {
        DeskThing.restoreKeys(KEYS)
      } catch {}
    }
  }, [])

  // Swipe left or right to change page. On the touchscreen this needs touch events: the browser treats a
  // finger drag as a possible scroll and cancels pointer events, so a pointer-only swipe never fires.
  // (The app also sets touch-action: pan-y, so sideways drags belong to us and lists still scroll up and down.)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swipeEnd = (x: number, y: number): void => {
    const p = start.current
    start.current = null
    if (!p) return
    const dx = x - p.x
    const dy = y - p.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setPage((n) => Math.min(PAGES.length - 1, Math.max(0, n + (dx < 0 ? 1 : -1))))
  }
  const onTouchStart = (e: React.TouchEvent): void => {
    const t = e.touches[0]
    if (t) start.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent): void => {
    const t = e.changedTouches[0]
    if (t) swipeEnd(t.clientX, t.clientY)
    // Don't let a tapped button keep focus, so the knob press (Enter) can't trigger it
    window.setTimeout(() => (document.activeElement as HTMLElement | null)?.blur?.(), 0)
  }
  // Mouse drags in DeskThing's PC window
  const onMouseDown = (e: React.MouseEvent): void => void (start.current = { x: e.clientX, y: e.clientY })
  const onMouseUp = (e: React.MouseEvent): void => swipeEnd(e.clientX, e.clientY)

  const pct = st?.duration ? Math.min(100, (100 * ms) / st.duration) : 0
  const content = useMemo(() => {
    switch (page) {
      case 1:
        return <Queue s={s} scrollRef={scrollRef} page={page} setPage={setPage} />
      case 2:
        return <Playlists s={s} scrollRef={scrollRef} page={page} setPage={setPage} />
      default:
        return <Home s={s} now={now} ms={ms} mode={mode} setMode={setMode} scrollRef={scrollRef} page={page} setPage={setPage} />
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, s, now, mode])

  return (
    <div className="app" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onMouseDown={onMouseDown} onMouseUp={onMouseUp}>
      <div className="bg">
        {bgImage && <img src={bgImage} alt="" />}
        <div className="bg-glow" />
      </div>

      <main className="page">{content}</main>

      {/* Home has its own controls; the other tabs keep the player strip */}
      {page !== 0 && (
        <footer className="strip">
          <div className="progress" onClick={(e) => st?.duration && command({ cmd: 'seek', ms: ((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth) * st.duration })}>
            <div style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
          {st?.thumbnail ? <img className="strip-cover" src={st.thumbnail} alt="" onClick={() => setPage(0)} /> : <div className="strip-cover" />}
          <div className="strip-text" onClick={() => setPage(0)}>
            <div className="strip-title">{st?.title || (s.bridge ? 'Nothing playing' : 'Spotify not connected')}</div>
            <div className="strip-sub">
              {st ? `${st.artists.join(', ')} · ${fmt(ms)} / ${fmt(st.duration)}` : 'Turn on the DeskThing Bridge extension in Spicetify'}
            </div>
          </div>
          {/* Like on its own, then previous / play / next together, the way every player lays them out */}
          <div className="strip-controls">
            {st && <LikeBadge liked={st.liked} size={42} />}
            <div className="transport">
              <button className="skip" onClick={() => command({ cmd: 'previous' })} aria-label="Previous">
                <I.Prev size={32} />
              </button>
              <button className="play" onClick={() => command({ cmd: 'toggle' })} aria-label={st?.playing ? 'Pause' : 'Play'}>
                {st?.playing ? <I.Pause size={30} /> : <I.Play size={30} />}
              </button>
              <button className="skip" onClick={() => command({ cmd: 'next' })} aria-label="Next">
                <I.Next size={32} />
              </button>
            </div>
          </div>
        </footer>
      )}

      {volumeHud != null && (
        <div className="hud">
          {volumeHud === 0 ? <I.Muted size={30} /> : <I.Speaker size={30} />}
          <div className="hud-bar">
            <div style={{ width: `${Math.round(volumeHud * 100)}%` }} />
          </div>
          <span>{Math.round(volumeHud * 100)}</span>
        </div>
      )}
    </div>
  )
}

export default App
