import { DeskThing } from '@deskthing/client'
import { useEffect, useState } from 'react'

export type State = {
  uri: string | null
  title: string
  artists: string[]
  album: string | null
  image: string | null
  thumbnail?: string | null
  duration: number
  progress: number
  playing: boolean
  shuffle: 0 | 1 | 2
  repeat: 'off' | 'all' | 'track'
  liked: boolean
  volume: number
  muted: boolean
  context: { uri: string | null; name: string | null }
  receivedAt: number
}
export type Line = { text: string; roman: string | null; time: number | null }
export type Lyrics = { uri: string; status: 'loading' | 'ok' | 'none'; synced?: boolean; lines: Line[] }
export type QueueItem = { uri: string; uid: string | null; title: string; artist: string; image: string | null }
export type Playlist = { uri: string; name: string; image: string | null; owner: string | null }
export type Stats = { cpu: number; memUsed: number; memTotal: number; uptime: number; host: string; time: number; tz?: number; gpu?: number | null; gpuTemp?: number | null; receivedAt?: number }
export type Weather = { temp: number; label: string; kind: string; day: boolean }

export type Spice = {
  bridge: boolean
  state: State | null
  lyrics: Lyrics | null
  queue: QueueItem[]
  playlists: Playlist[]
  stats: Stats | null
  weather: Weather | null
}

// One shared store fed by the app's server; components subscribe with useSpice()
let store: Spice = { bridge: false, state: null, lyrics: null, queue: [], playlists: [], stats: null, weather: null }
const subs = new Set<(s: Spice) => void>()
const set = (patch: Partial<Spice>): void => {
  store = { ...store, ...patch }
  subs.forEach((f) => f(store))
}

let started = false
function start(): void {
  if (started) return
  started = true
  DeskThing.on('spice' as never, ((data: { request?: string; payload?: unknown }) => {
    const p = data.payload as never
    switch (data.request) {
      case 'status':
        return set({ bridge: !!(p as { bridge: boolean }).bridge })
      case 'state':
        return set({ state: { ...(p as State), receivedAt: Date.now() }, bridge: true })
      case 'lyrics':
        return set({ lyrics: p })
      case 'queue':
        return set({ queue: (p as { next: QueueItem[] }).next ?? [] })
      case 'library':
        return set({ playlists: (p as { playlists: Playlist[] }).playlists ?? [] })
      case 'weather':
        return set({ weather: p })
      case 'stats':
        return set({ stats: { ...(p as Stats), receivedAt: Date.now() } })
    }
  }) as never)
  DeskThing.send({ type: 'spice', request: 'hello' } as never)
}

export function useSpice(): Spice {
  const [s, setS] = useState(store)
  useEffect(() => {
    start()
    subs.add(setS)
    return () => void subs.delete(setS)
  }, [])
  return s
}

export function command(payload: Record<string, unknown>): void {
  DeskThing.send({ type: 'spice', request: 'command', payload } as never)
}

// Playback position, moving on its own between updates from Spotify
export function progressOf(s: State | null, now = Date.now()): number {
  if (!s) return 0
  const p = s.playing ? s.progress + (now - s.receivedAt) : s.progress
  return Math.max(0, Math.min(p, s.duration || p))
}

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export const fmt = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Index of the lyric line being sung
export function activeLine(lyrics: Lyrics | null, ms: number): number {
  if (!lyrics?.synced) return -1
  let idx = -1
  for (let i = 0; i < lyrics.lines.length; i++) {
    const t = lyrics.lines[i].time
    if (t != null && t <= ms + 150) idx = i
    else if (t != null) break
  }
  return idx
}
