import { DeskThing } from '@deskthing/client'

// DeskThing's own player bar ("miniplayer") is a preference of the DeskThing client on the Car Thing, saved in its
// localStorage under "settings-storage" (preferences.miniplayer.visible, shown as "Show Miniplayer" in its settings).
// Our app is served from the same address as that client, so it can read and change the preference, then reload
// the client so it takes effect. If that isn't possible, we fall back to opening DeskThing's settings page.

const KEY = 'settings-storage'

type Stored = { state?: { preferences?: { miniplayer?: { state?: string; visible?: boolean; position?: string } } }; version?: number }

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

function sameOriginParent(): Window | null {
  try {
    if (window.parent === window) return null
    void window.parent.location.href // throws when cross-origin
    return window.parent
  } catch {
    return null
  }
}

/** true / false when known, null when the client's settings can't be read from here */
export function deskthingBarVisible(): boolean | null {
  if (!sameOriginParent()) return null
  const s = read()
  const mp = s?.state?.preferences?.miniplayer
  if (!mp) return null
  return mp.visible !== false
}

export function setDeskthingBar(visible: boolean): boolean {
  const parent = sameOriginParent()
  const s = read()
  if (!parent || !s?.state?.preferences) {
    openDeskthingSettings()
    return false
  }
  const mp = s.state.preferences.miniplayer ?? { state: 'peek', position: 'bottom' }
  s.state.preferences.miniplayer = { ...mp, visible }
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
    // Reload straight away, before the client writes its in-memory settings back over ours
    parent.location.reload()
    return true
  } catch {
    openDeskthingSettings()
    return false
  }
}

export function openDeskthingSettings(): void {
  try {
    DeskThing.triggerAction({ id: 'open', value: 'settings', source: 'server' } as never)
  } catch {}
}
