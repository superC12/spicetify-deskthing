import { DeskThing } from '@deskthing/server'
import { DESKTHING_EVENTS, SongEvent, AUDIO_REQUESTS, SongAbilities, SongData11 } from '@deskthing/types'
import { WebSocketServer, WebSocket } from 'ws'
import os from 'node:os'

// The Spicetify "DeskThing Bridge" extension connects here from Spotify
const BRIDGE_PORT = 8892

type BridgeState = {
  uri: string | null
  title: string
  artists: string[]
  album: string | null
  image: string | null
  duration: number
  progress: number
  playing: boolean
  shuffle: 0 | 1 | 2
  repeat: 'off' | 'all' | 'track'
  liked: boolean
  volume: number
  muted: boolean
  context: { uri: string | null; name: string | null }
  at: number
}

const cache: {
  state: (BridgeState & { thumbnail?: string | null }) | null
  lyrics: unknown
  queue: unknown
  library: unknown
} = { state: null, lyrics: null, queue: null, library: null }

let wss: WebSocketServer | null = null
let bridge: WebSocket | null = null
let statsTimer: (() => void) | null = null

// ------------------------------------------------------------------ images

// The Car Thing has no internet of its own, so covers are fetched here and sent as data URLs
const images = new Map<string, string>()
async function toDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) return url
  const hit = images.get(url)
  if (hit) return hit
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    const data = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
    if (images.size > 300) images.delete(images.keys().next().value as string)
    images.set(url, data)
    return data
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ to the device

const toClient = (request: string, payload: unknown): void => {
  DeskThing.send({ type: 'spice', request, payload } as never)
}

function songData(s: BridgeState & { thumbnail?: string | null }): SongData11 {
  return {
    version: 2,
    track_name: s.title,
    album: s.album,
    artist: s.artists.join(', ') || null,
    playlist: s.context?.name ?? null,
    playlist_id: s.context?.uri ?? null,
    shuffle_state: s.shuffle !== 0,
    repeat_state: s.repeat,
    is_playing: s.playing,
    source: 'spicetify',
    abilities: [
      SongAbilities.LIKE,
      SongAbilities.SHUFFLE,
      SongAbilities.REPEAT,
      SongAbilities.PLAY,
      SongAbilities.PAUSE,
      SongAbilities.NEXT,
      SongAbilities.PREVIOUS,
      SongAbilities.REWIND,
      SongAbilities.FAST_FORWARD,
      SongAbilities.CHANGE_VOLUME
    ],
    track_duration: s.duration,
    track_progress: s.progress,
    volume: Math.round((s.muted ? 0 : s.volume) * 100),
    thumbnail: s.thumbnail ?? null,
    device: 'Spotify (Spicetify)',
    device_id: null,
    id: s.uri,
    liked: s.liked,
    can_like: true,
    can_change_volume: true,
    can_set_output: false,
    can_fast_forward: true,
    can_skip: true
  }
}

let lastThumbFor: string | null = null
async function onState(state: BridgeState): Promise<void> {
  const prevImage = cache.state?.image
  cache.state = { ...state, thumbnail: prevImage === state.image ? cache.state?.thumbnail : null }
  toClient('state', cache.state)
  if (state.image !== prevImage || !cache.state.thumbnail) {
    const want = state.image
    lastThumbFor = want
    const thumbnail = await toDataUrl(want)
    if (lastThumbFor !== want || !cache.state) return
    cache.state.thumbnail = thumbnail
    toClient('state', cache.state)
  }
  DeskThing.sendSong(songData(cache.state))
}

async function onQueue(queue: { next: { image: string | null }[] }): Promise<void> {
  cache.queue = queue
  toClient('queue', queue)
  // Small covers for the first few rows
  const withImages = await Promise.all(queue.next.slice(0, 20).map(async (t) => ({ ...t, image: await toDataUrl(t.image) })))
  cache.queue = { next: [...withImages, ...queue.next.slice(20).map((t) => ({ ...t, image: null }))] }
  toClient('queue', cache.queue)
}

async function onLibrary(lib: { playlists: { image: string | null }[] }): Promise<void> {
  const playlists = await Promise.all(lib.playlists.map(async (p, i) => ({ ...p, image: i < 60 ? await toDataUrl(p.image) : null })))
  cache.library = { playlists }
  toClient('library', cache.library)
}

function sendStatus(): void {
  toClient('status', { bridge: !!bridge && bridge.readyState === WebSocket.OPEN })
}

// ------------------------------------------------------------------ to Spotify

function command(payload: Record<string, unknown>): void {
  if (bridge?.readyState === WebSocket.OPEN) bridge.send(JSON.stringify({ type: 'command', payload }))
}

// DeskThing's own music requests (the built-in player, button mappings)
function onAudioRequest(data: { request?: string; payload?: unknown }): void {
  const p = data.payload
  switch (data.request) {
    case AUDIO_REQUESTS.NEXT:
      return command({ cmd: 'next' })
    case AUDIO_REQUESTS.PREVIOUS:
      return command({ cmd: 'previous' })
    case AUDIO_REQUESTS.PLAY:
      return command({ cmd: 'play' })
    case AUDIO_REQUESTS.PAUSE:
    case AUDIO_REQUESTS.STOP:
      return command({ cmd: 'pause' })
    case AUDIO_REQUESTS.SEEK:
      return command({ cmd: 'seek', ms: Number(p) })
    case AUDIO_REQUESTS.FAST_FORWARD:
      return command({ cmd: 'skipBy', ms: Number(p) || 15000 })
    case AUDIO_REQUESTS.REWIND:
      return command({ cmd: 'skipBy', ms: -(Number(p) || 15000) })
    case AUDIO_REQUESTS.LIKE:
      return command({ cmd: 'like', value: typeof p === 'boolean' ? p : undefined })
    case AUDIO_REQUESTS.VOLUME:
      return command({ cmd: 'volume', value: Number(p) / 100 })
    case AUDIO_REQUESTS.REPEAT:
      return command({ cmd: 'repeat', value: p })
    case AUDIO_REQUESTS.SHUFFLE:
      return command({ cmd: 'shuffle', value: typeof p === 'boolean' ? p : undefined })
  }
}

// ------------------------------------------------------------------ PC stats

let lastCpu = os.cpus().map((c) => c.times)
function cpuPercent(): number {
  const now = os.cpus().map((c) => c.times)
  let idle = 0
  let total = 0
  now.forEach((t, i) => {
    const p = lastCpu[i] ?? t
    const d = (k: keyof typeof t): number => t[k] - p[k]
    idle += d('idle')
    total += d('user') + d('nice') + d('sys') + d('irq') + d('idle')
  })
  lastCpu = now
  return total ? Math.round(100 * (1 - idle / total)) : 0
}
function stats(): void {
  const total = os.totalmem()
  toClient('stats', {
    cpu: cpuPercent(),
    memUsed: total - os.freemem(),
    memTotal: total,
    uptime: os.uptime(),
    host: os.hostname(),
    time: Date.now()
  })
}

// ------------------------------------------------------------------ lifecycle

const start = async (): Promise<void> => {
  wss = new WebSocketServer({ host: '127.0.0.1', port: BRIDGE_PORT })
  wss.on('error', (e) => console.error('[spicetify] bridge server error', e))
  wss.on('connection', (socket) => {
    bridge?.close()
    bridge = socket
    sendStatus()
    socket.on('message', (raw) => {
      let msg: { type?: string; payload?: unknown }
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      switch (msg.type) {
        case 'state':
          void onState(msg.payload as BridgeState)
          break
        case 'lyrics':
          cache.lyrics = msg.payload
          toClient('lyrics', msg.payload)
          break
        case 'queue':
          void onQueue(msg.payload as never)
          break
        case 'library':
          void onLibrary(msg.payload as never)
          break
      }
    })
    socket.on('close', () => {
      if (bridge === socket) bridge = null
      sendStatus()
    })
  })

  // Requests from our own screens on the device
  DeskThing.on('spice' as never, ((data: { request?: string; payload?: Record<string, unknown> }) => {
    if (data.request === 'command' && data.payload) command(data.payload)
    else if (data.request === 'hello') {
      sendStatus()
      if (cache.state) toClient('state', cache.state)
      if (cache.lyrics) toClient('lyrics', cache.lyrics)
      if (cache.queue) toClient('queue', cache.queue)
      if (cache.library) toClient('library', cache.library)
      stats()
      if (bridge?.readyState === WebSocket.OPEN) bridge.send(JSON.stringify({ type: 'refresh' }))
    }
  }) as never)

  DeskThing.on(SongEvent.SET, onAudioRequest as never)
  DeskThing.on(SongEvent.GET, (() => {
    if (cache.state) DeskThing.sendSong(songData(cache.state))
  }) as never)

  statsTimer = DeskThing.setInterval(async () => stats(), 2000)
  console.log(`[spicetify] waiting for Spotify on ws://127.0.0.1:${BRIDGE_PORT}`)
}

const stop = async (): Promise<void> => {
  statsTimer?.()
  bridge?.close()
  wss?.close()
  wss = null
  bridge = null
}

DeskThing.on(DESKTHING_EVENTS.START, start)
DeskThing.on(DESKTHING_EVENTS.STOP, stop)
