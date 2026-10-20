import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DeskThing } from '@deskthing/client'
import { useSpice, useNow, command, progressOf, fmt, activeLine, Spice, Lyrics } from './spice'
import { applyTheme, blurredCover } from './theme'
import { deskthingBarVisible, setDeskthingBar, openDeskthingSettings } from './deskthingClient'
import * as I from './icons'

const PAGES = ['Now playing', 'Lyrics', 'Up next', 'Playlists', 'PC'] as const
type ScriptMode = 'original' | 'romanized' | 'both'

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

// ------------------------------------------------------------------ pages

const NowPlaying: React.FC<{ s: Spice; now: number; mode: ScriptMode }> = ({ s, now, mode }) => {
  const st = s.state
  const idx = activeLine(s.lyrics, progressOf(st, now))
  const line = idx >= 0 ? s.lyrics!.lines[idx] : null
  return (
    <div className="now">
      <div className="now-text">
        {st?.context?.name && <div className="kicker">{st.context.name}</div>}
        <div className="big-title">{st?.title || 'Nothing playing'}</div>
        <div className="big-artist">{st?.artists.join(', ') || (s.bridge ? 'Play something in Spotify' : 'Waiting for Spotify…')}</div>
        <div className="now-line">
          {line && (mode !== 'romanized' || !line.roman) && <div>{line.text || '♪'}</div>}
          {line?.roman && mode !== 'original' && <div className="roman">{line.roman}</div>}
        </div>
        <div className="now-controls">
          <Toggle on={(st?.shuffle ?? 0) > 0} label="Shuffle" onClick={() => command({ cmd: 'shuffle' })}>
            {st?.shuffle === 2 ? <I.SmartShuffle size={24} /> : <I.Shuffle size={24} />}
          </Toggle>
          <button className="plain" onClick={() => command({ cmd: 'previous' })} aria-label="Previous">
            <I.Prev size={26} />
          </button>
          <Toggle on={st?.repeat !== 'off' && !!st} label="Repeat" onClick={() => command({ cmd: 'repeat' })}>
            {st?.repeat === 'track' ? <I.RepeatOne size={24} /> : <I.Repeat size={24} />}
          </Toggle>
          <button className="plain" onClick={() => command({ cmd: 'fullScreen' })} aria-label="Full screen on PC">
            <I.Expand size={24} />
          </button>
        </div>
      </div>
      <div className="now-cover">{st?.thumbnail ? <img src={st.thumbnail} alt="" /> : <div className="cover-empty" />}</div>
    </div>
  )
}

const LyricsPage: React.FC<{ lyrics: Lyrics | null; ms: number; mode: ScriptMode; setMode: (m: ScriptMode) => void; scrollRef: React.RefObject<HTMLDivElement> }> = ({
  lyrics,
  ms,
  mode,
  setMode,
  scrollRef
}) => {
  const idx = activeLine(lyrics, ms)
  const held = useRef(0)
  const hasRoman = lyrics?.lines.some((l) => l.roman)
  useEffect(() => {
    const box = scrollRef.current
    const el = box?.querySelector<HTMLElement>(`[data-i="${idx}"]`)
    if (!box || !el || Date.now() < held.current) return
    box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.35, behavior: 'smooth' })
  }, [idx, scrollRef])
  return (
    <div className="lyrics">
      {hasRoman && (
        <div className="segs">
          {(['original', 'romanized', 'both'] as const).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'original' ? 'As written' : m === 'romanized' ? 'Romanized' : 'Both'}
            </button>
          ))}
        </div>
      )}
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

const Queue: React.FC<{ s: Spice; scrollRef: React.RefObject<HTMLDivElement> }> = ({ s, scrollRef }) => (
  <div className="listpage">
    <div className="page-title">Up next</div>
    <div className="list" ref={scrollRef}>
      {s.queue.length === 0 && <div className="empty">Nothing queued</div>}
      {s.queue.map((t, i) => (
        <button key={(t.uid ?? t.uri) + i} className="row" onClick={() => command({ cmd: 'skipTo', uri: t.uri, uid: t.uid })}>
          {t.image ? <img src={t.image} alt="" /> : <span className="thumb-empty" />}
          <span className="row-text">
            <span className="row-title">{t.title}</span>
            <span className="row-sub">{t.artist}</span>
          </span>
        </button>
      ))}
    </div>
  </div>
)

const Playlists: React.FC<{ s: Spice; scrollRef: React.RefObject<HTMLDivElement> }> = ({ s, scrollRef }) => (
  <div className="listpage">
    <div className="page-title">Playlists</div>
    <div className="grid" ref={scrollRef}>
      {s.playlists.length === 0 && <div className="empty">No playlists yet</div>}
      {s.playlists.map((p) => (
        <button key={p.uri} className={`tile ${s.state?.context?.uri === p.uri ? 'playing' : ''}`} onClick={() => command({ cmd: 'playUri', uri: p.uri })}>
          {p.image ? <img src={p.image} alt="" /> : <span className="tile-empty">♪</span>}
          <span className="tile-name">{p.name}</span>
        </button>
      ))}
    </div>
  </div>
)

const PC: React.FC<{ s: Spice; now: number }> = ({ s, now }) => {
  const d = new Date(now)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const [hm, ampm] = time.split(' ')
  const st = s.stats
  const mem = st ? Math.round((100 * st.memUsed) / st.memTotal) : null
  const bar = deskthingBarVisible()
  return (
    <div className="pc">
      <div className="pc-left">
        <div className="clock">
          {hm}
          {ampm && <span className="ampm">{ampm}</span>}
        </div>
        <div className="date">{d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div className="actions">
          <button onClick={() => command({ cmd: 'fullScreen' })}>
            <I.Expand size={22} />
            Full screen
          </button>
          <button onClick={() => command({ cmd: 'miniPlayer' })}>
            <I.MiniPlayer size={22} />
            Mini player
          </button>
          <button onClick={() => command({ cmd: 'lyricsPage' })}>
            <I.Mic size={22} />
            Lyrics
          </button>
        </div>
        <div className="actions">
          {bar !== null && (
            <button onClick={() => setDeskthingBar(!bar)}>{bar ? 'Hide DeskThing bar' : 'Show DeskThing bar'}</button>
          )}
          <button onClick={openDeskthingSettings}>DeskThing settings</button>
        </div>
      </div>
      <div className="pc-right">
        <div className="stat">
          <div className="stat-num">{st ? `${st.cpu}%` : '–'}</div>
          <div className="stat-label">CPU</div>
          <div className="meter">
            <div style={{ width: `${st?.cpu ?? 0}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-num">{mem != null ? `${mem}%` : '–'}</div>
          <div className="stat-label">Memory{st ? ` · ${(st.memUsed / 2 ** 30).toFixed(1)} of ${(st.memTotal / 2 ** 30).toFixed(0)} GB` : ''}</div>
          <div className="meter">
            <div style={{ width: `${mem ?? 0}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

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
  // Offer once to hide DeskThing's own player bar, which duplicates our strip
  const [barPrompt, setBarPrompt] = useState(() => deskthingBarVisible() === true && !localStorage.getItem('spice:barPromptDismissed'))
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

  // The knob scrolls lists and lyrics, and changes the volume on the other pages. Pressing it plays or pauses.
  // The four top buttons jump to Now playing, Lyrics, Up next and Playlists.
  const volumeRef = useRef(0)
  const turnedAt = useRef(0)
  const sendTimer = useRef<number>()
  // While the knob is turning, keep our own volume rather than Spotify's slightly older one, so it doesn't jump back
  if (Date.now() - turnedAt.current > 1500) volumeRef.current = st ? (st.muted ? 0 : st.volume) : 0
  const pageRef = useRef(page)
  pageRef.current = page
  useEffect(() => {
    const KEYS = ['Scroll', 'Enter', 'Digit1', 'Digit2', 'Digit3', 'Digit4']
    try {
      DeskThing.overrideKeys(KEYS)
    } catch {}
    const onWheel = (e: WheelEvent): void => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!delta) return
      const p = pageRef.current
      if (p === 1 || p === 2 || p === 3) {
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
      if (e.key === 'Enter') return command({ cmd: 'toggle' })
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code)
      const k = ['1', '2', '3', '4'].indexOf(e.key)
      const target = n >= 0 ? n : k
      if (target >= 0) setPage(target)
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

  // Swipe left or right to change page
  const start = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent): void => void (start.current = { x: e.clientX, y: e.clientY })
  const onPointerUp = (e: React.PointerEvent): void => {
    const p = start.current
    start.current = null
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) setPage((n) => Math.min(PAGES.length - 1, Math.max(0, n + (dx < 0 ? 1 : -1))))
  }

  const pct = st?.duration ? Math.min(100, (100 * ms) / st.duration) : 0
  const content = useMemo(() => {
    switch (page) {
      case 0:
        return <NowPlaying s={s} now={now} mode={mode} />
      case 1:
        return <LyricsPage lyrics={s.lyrics} ms={ms} mode={mode} setMode={setMode} scrollRef={scrollRef} />
      case 2:
        return <Queue s={s} scrollRef={scrollRef} />
      case 3:
        return <Playlists s={s} scrollRef={scrollRef} />
      default:
        return <PC s={s} now={now} />
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, s, now, mode])

  return (
    <div className="app" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="bg">
        {bgImage && <img src={bgImage} alt="" />}
        <div className="bg-glow" />
      </div>

      <div className="dots">
        {PAGES.map((p, i) => (
          <button key={p} className={i === page ? 'on' : ''} onClick={() => setPage(i)} aria-label={p} />
        ))}
      </div>

      <main className="page">{content}</main>

      {barPrompt && (
        <div className="prompt">
          <span>DeskThing's own player bar is showing too.</span>
          <button className="prompt-yes" onClick={() => setDeskthingBar(false)}>
            Hide it
          </button>
          <button
            className="prompt-no"
            onClick={() => {
              localStorage.setItem('spice:barPromptDismissed', '1')
              setBarPrompt(false)
            }}
          >
            Keep
          </button>
        </div>
      )}

      <footer className="strip">
        <div className="progress" onClick={(e) => st?.duration && command({ cmd: 'seek', ms: ((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth) * st.duration })}>
          <div style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        {st?.thumbnail ? <img className="strip-cover" src={st.thumbnail} alt="" onClick={() => setPage(0)} /> : <div className="strip-cover" />}
        <div className="strip-text" onClick={() => setPage(page === 1 ? 0 : 1)}>
          <div className="strip-title">{st?.title || (s.bridge ? 'Nothing playing' : 'Spotify not connected')}</div>
          <div className="strip-sub">
            {st ? `${st.artists.join(', ')} · ${fmt(ms)} / ${fmt(st.duration)}` : 'Turn on the DeskThing Bridge extension in Spicetify'}
          </div>
        </div>
        <div className="strip-controls">
          {st && <LikeBadge liked={st.liked} />}
          <button className="big" onClick={() => command({ cmd: 'toggle' })} aria-label={st?.playing ? 'Pause' : 'Play'}>
            {st?.playing ? <I.Pause size={50} /> : <I.Play size={50} />}
          </button>
          <button className="big" onClick={() => command({ cmd: 'next' })} aria-label="Next">
            <I.Next size={50} />
          </button>
        </div>
      </footer>

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
