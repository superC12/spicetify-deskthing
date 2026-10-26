import { DeskThing } from '@deskthing/server'
import { DESKTHING_EVENTS, SongEvent, AUDIO_REQUESTS, SongAbilities, SongData11, SETTING_TYPES } from '@deskthing/types'
import { WebSocketServer, WebSocket } from 'ws'
import os from 'node:os'
import { execFile } from 'node:child_process'
import path from 'node:path'

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
  weather: unknown
} = { state: null, lyrics: null, queue: null, library: null, weather: null }

let wss: WebSocketServer | null = null
let bridge: WebSocket | null = null
let statsTimer: (() => void) | null = null
let gpuTimer: (() => void) | null = null
let weatherTimer: (() => void) | null = null

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
  const open = bridge?.readyState === WebSocket.OPEN
  // Shows up in DeskThing's log, so a control that does nothing can be traced
  console.log('[spicetify] command', payload.cmd, open ? 'sent to Spotify' : 'NOT sent: Spotify is not connected')
  if (open) bridge!.send(JSON.stringify({ type: 'command', payload }))
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
// GPU usage and temperature from NVIDIA's driver tool. Missing on PCs without an NVIDIA card; then it's just left out.
// (CPU temperature isn't readable on Windows without a separate monitoring tool, so there's none.)
let gpu: { use: number; temp: number } | null = null
// DeskThing runs app servers with an almost empty environment (no PATH, SystemRoot or ProgramFiles), and
// NVIDIA's driver library fails to start without them ("Failed to initialize NVML"). So nvidia-smi gets its
// full path and the standard Windows variables, filled in with the usual defaults when they're missing.
// Whichever path works is remembered; the first failure is written to DeskThing's log.
const WIN_ROOT = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
const GPU_ENV: NodeJS.ProcessEnv =
  process.platform === 'win32'
    ? {
        ...process.env,
        SystemRoot: WIN_ROOT,
        windir: WIN_ROOT,
        SystemDrive: process.env.SystemDrive || WIN_ROOT.slice(0, 2),
        ProgramFiles: process.env.ProgramFiles || 'C:\\Program Files',
        ProgramW6432: process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files',
        ProgramData: process.env.ProgramData || 'C:\\ProgramData',
        PATH: [process.env.PATH, path.join(WIN_ROOT, 'System32'), WIN_ROOT].filter(Boolean).join(';')
      }
    : process.env
const GPU_TOOLS = [...(process.platform === 'win32' ? [path.join(WIN_ROOT, 'System32', 'nvidia-smi.exe')] : []), 'nvidia-smi']
let gpuTool = 0
let gpuWarned = false
function readGpu(): void {
  execFile(
    GPU_TOOLS[gpuTool],
    ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'],
    { timeout: 3000, windowsHide: true, env: GPU_ENV },
    (error, stdout) => {
      if (error) {
        gpu = null
        if (gpuTool < GPU_TOOLS.length - 1) {
          gpuTool++
          return readGpu()
        }
        if (!gpuWarned) console.warn('[spicetify] GPU reading unavailable:', String(error.message || error).split('\n')[0])
        gpuWarned = true
        gpuTool = 0
        return
      }
      const [use, temp] = String(stdout).split('\n')[0].split(',').map((v) => Number(v.trim()))
      gpu = Number.isFinite(use) && Number.isFinite(temp) ? { use, temp } : null
    }
  )
}

function stats(): void {
  const total = os.totalmem()
  toClient('stats', {
    cpu: cpuPercent(),
    memUsed: total - os.freemem(),
    memTotal: total,
    uptime: os.uptime(),
    host: os.hostname(),
    time: Date.now(),
    // The PC's time zone (minutes east of UTC), so the Car Thing can show the PC's local time
    tz: -new Date().getTimezoneOffset(),
    gpu: gpu?.use ?? null,
    gpuTemp: gpu?.temp ?? null
  })
}

// ------------------------------------------------------------------ weather

// Fetched on the PC (the Car Thing has no internet) from Open-Meteo, which needs no account or key.
// The location is a US ZIP code the user enters in the app's settings in DeskThing (kept on their PC, never in this
// code); it is turned into coordinates once with zippopotam.us. With no ZIP set there is no weather.
let weatherZip = ''
let coords: { lat: number; lon: number } | null = null
let weatherKey = ''

const SETTINGS = {
  weatherZip: {
    id: 'weatherZip',
    type: SETTING_TYPES.STRING,
    label: 'Weather ZIP code',
    description: 'US ZIP code for the weather on the Home screen. Leave empty to hide the weather.',
    value: '',
    maxLength: 10
  }
}

function setWeatherZip(value: unknown): void {
  const zip = String(value ?? '').trim()
  if (zip === weatherZip) return
  weatherZip = zip
  coords = null
  weatherKey = ''
  if (!zip) {
    cache.weather = null
    toClient('weather', null)
    return
  }
  void weather()
}

// WMO weather codes, as Open-Meteo reports them
function describe(code: number): { label: string; kind: string } {
  if (code === 0) return { label: 'Clear', kind: 'clear' }
  if (code === 1) return { label: 'Mostly clear', kind: 'clear' }
  if (code === 2) return { label: 'Partly cloudy', kind: 'partly' }
  if (code === 3) return { label: 'Cloudy', kind: 'cloudy' }
  if (code === 45 || code === 48) return { label: 'Fog', kind: 'fog' }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', kind: 'rain' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', kind: 'rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', kind: 'snow' }
  if (code >= 95) return { label: 'Storms', kind: 'storm' }
  return { label: 'Cloudy', kind: 'cloudy' }
}

async function weather(): Promise<void> {
  if (!weatherZip) return
  try {
    if (!coords) {
      const z = (await (await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(weatherZip)}`)).json()) as { places?: { latitude: string; longitude: string }[] }
      const p = z.places?.[0]
      if (!p) return console.warn('[spicetify] weather: ZIP code not found')
      coords = { lat: Number(p.latitude), lon: Number(p.longitude) }
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit&timezone=auto`
    const w = (await (await fetch(url)).json()) as { current?: { temperature_2m: number; weather_code: number; is_day: number } }
    if (!w.current) return
    const { label, kind } = describe(w.current.weather_code)
    const payload = { temp: Math.round(w.current.temperature_2m), label, kind, day: w.current.is_day === 1 }
    const key = JSON.stringify(payload)
    cache.weather = payload
    // Only send when something changed (DeskThing replays everything it queued while the Car Thing was away)
    if (key !== weatherKey) {
      weatherKey = key
      toClient('weather', payload)
    }
  } catch (e) {
    console.warn('[spicetify] weather failed', e)
  }
}

// ------------------------------------------------------------------ lifecycle

// When DeskThing reloads the app it starts a new copy of this server but can leave the old one running, still
// holding the port, so Spotify stays connected to the old copy and the Car Thing's commands reach a copy with no
// Spotify. A new copy that finds the port taken asks the old one to hand it over, then keeps retrying until it can.
let stopped = false
function listen(): void {
  if (stopped) return
  const server = new WebSocketServer({ host: '127.0.0.1', port: BRIDGE_PORT })
  wss = server
  server.on('listening', () => console.log('[spicetify] waiting for Spotify on ws://127.0.0.1:' + BRIDGE_PORT))
  server.on('error', (e: NodeJS.ErrnoException) => {
    if (wss === server) wss = null
    if (e.code !== 'EADDRINUSE') return console.error('[spicetify] bridge server error', e)
    console.log('[spicetify] port ' + BRIDGE_PORT + ' is held by an older copy of the app; asking it to hand over')
    const ask = new WebSocket('ws://127.0.0.1:' + BRIDGE_PORT + '/?takeover=1')
    ask.on('error', () => {})
    ask.on('open', () => ask.close())
    setTimeout(listen, 1500)
  })
  server.on('connection', onConnection)
}

// The old copy's side of the hand-over: close everything and stop, so the new copy can take the port
function handOver(): void {
  console.log('[spicetify] a newer copy of the app started; handing the port over')
  stopped = true
  statsTimer?.()
  gpuTimer?.()
  weatherTimer?.()
  bridge?.close()
  bridge = null
  wss?.clients.forEach((c) => c.terminate())
  wss?.close()
  wss = null
}

function onConnection(socket: WebSocket, req: { url?: string }): void {
  if (req.url?.includes('takeover')) {
    socket.close()
    return handOver()
  }
  {
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
        case 'log':
          console.log('[spicetify] Spotify ran', JSON.stringify(msg.payload))
          break
      }
    })
    socket.on('close', () => {
      if (bridge === socket) bridge = null
      sendStatus()
    })
  }
}

const start = async (): Promise<void> => {
  stopped = false
  listen()

  // Requests from our own screens on the device
  DeskThing.on('spice' as never, ((data: { request?: string; payload?: Record<string, unknown> }) => {
    if (data.request === 'command' && data.payload) command(data.payload)
    else if (data.request === 'hello') {
      sendStatus()
      if (cache.state) toClient('state', cache.state)
      if (cache.lyrics) toClient('lyrics', cache.lyrics)
      if (cache.queue) toClient('queue', cache.queue)
      if (cache.library) toClient('library', cache.library)
      if (cache.weather) toClient('weather', cache.weather)
      stats()
      if (bridge?.readyState === WebSocket.OPEN) bridge.send(JSON.stringify({ type: 'refresh' }))
    }
  }) as never)

  DeskThing.on(SongEvent.SET, onAudioRequest as never)
  DeskThing.on(SongEvent.GET, (() => {
    if (cache.state) DeskThing.sendSong(songData(cache.state))
  }) as never)

  // The weather ZIP lives in DeskThing's settings for this app
  try {
    await DeskThing.initSettings(SETTINGS as never)
    const saved = (await DeskThing.getSettings()) as Record<string, { value?: unknown }> | null
    setWeatherZip(saved?.weatherZip?.value)
  } catch (e) {
    console.warn('[spicetify] settings unavailable', e)
  }
  DeskThing.on(DESKTHING_EVENTS.SETTINGS, ((data: { payload?: Record<string, { value?: unknown }> }) => {
    if (data.payload?.weatherZip) setWeatherZip(data.payload.weatherZip.value)
  }) as never)

  readGpu()
  gpuTimer = DeskThing.setInterval(async () => readGpu(), 5000)
  statsTimer = DeskThing.setInterval(async () => stats(), 2000)
  weatherTimer = DeskThing.setInterval(async () => weather(), 15 * 60 * 1000)
}

const stop = async (): Promise<void> => {
  stopped = true
  statsTimer?.()
  gpuTimer?.()
  weatherTimer?.()
  bridge?.close()
  wss?.close()
  wss = null
  bridge = null
}

DeskThing.on(DESKTHING_EVENTS.START, start)
DeskThing.on(DESKTHING_EVENTS.STOP, stop)
