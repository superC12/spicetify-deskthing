// The Juxtaposed theme's colours, worked out the same way as its theme.js: the cover's dominant hue
// (pixels vote by how colourful they are), dark surfaces in that hue, and a brighter accent.

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h /= 6
  return [h * 360, s, l]
}

function hueOf(url: string): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        const N = 24
        const votes = new Array(N).fill(0)
        const sx = new Array(N).fill(0)
        const sy = new Array(N).fill(0)
        const ss = new Array(N).fill(0)
        let total = 0
        for (let i = 0; i < data.length; i += 4) {
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
          const chroma = s * (1 - Math.abs(2 * l - 1))
          const b = Math.floor((h / 360) * N) % N
          const a = (h * Math.PI) / 180
          votes[b] += chroma
          sx[b] += Math.cos(a) * chroma
          sy[b] += Math.sin(a) * chroma
          ss[b] += s * chroma
          total += chroma
        }
        if (total / (size * size) < 0.02) return resolve([0, 0])
        let best = 0
        let bestScore = -1
        for (let i = 0; i < N; i++) {
          const score = votes[(i + N - 1) % N] + votes[i] + votes[(i + 1) % N]
          if (score > bestScore) {
            bestScore = score
            best = i
          }
        }
        let x = 0
        let y = 0
        let s = 0
        for (const i of [(best + N - 1) % N, best, (best + 1) % N]) {
          x += sx[i]
          y += sy[i]
          s += ss[i]
        }
        resolve([((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, s / bestScore])
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = reject
    img.src = url
  })
}

// A pre-blurred copy of the cover. Blurring a full-screen image live with CSS is too slow for the Car Thing,
// so the cover is shrunk to a few pixels once per song and stretched back up, which looks the same and costs nothing.
export function blurredCover(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 48
        c.height = 30
        const ctx = c.getContext('2d')!
        ctx.filter = 'blur(2px) saturate(1.25)'
        ctx.drawImage(img, -6, -6, 60, 42)
        resolve(c.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

let appliedFor: string | null = null
export async function applyTheme(cover: string | null | undefined): Promise<void> {
  if (!cover || cover === appliedFor) return
  appliedFor = cover
  let h = 0
  let s = 0
  try {
    ;[h, s] = await hueOf(cover)
  } catch {
    return
  }
  if (appliedFor !== cover) return
  const surface = s < 0.08 ? s : Math.min(Math.max(s, 0.3), 0.55)
  const accentS = s < 0.08 ? 0 : Math.max(s, 0.45)
  const pct = (n: number): string => `${Math.round(n * 100)}%`
  const root = document.documentElement.style
  root.setProperty('--bg', `hsl(${h}, ${pct(surface)}, 9%)`)
  root.setProperty('--bg-deep', `hsl(${h}, ${pct(surface)}, 3%)`)
  root.setProperty('--glow', `hsl(${h}, ${pct(surface)}, 20%)`)
  root.setProperty('--card', `hsl(${h}, ${pct(surface)}, 14%)`)
  root.setProperty('--strip', `hsla(${h}, ${pct(surface)}, 5%, 0.88)`)
  root.setProperty('--accent', `hsl(${h}, ${pct(accentS)}, 62%)`)
  root.setProperty('--accent-soft', `hsla(${h}, ${pct(accentS)}, 62%, .2)`)
}
