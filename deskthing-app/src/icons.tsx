import React from 'react'

const S = (d: React.ReactNode, vb = '0 0 24 24') => (props: { size?: number }) => (
  <svg viewBox={vb} width={props.size ?? 28} height={props.size ?? 28} fill="currentColor" aria-hidden="true">
    {d}
  </svg>
)

export const Play = S(<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />)
export const Pause = S(
  <>
    <rect x="5" y="4" width="5" height="16" rx="1.4" />
    <rect x="14" y="4" width="5" height="16" rx="1.4" />
  </>
)
export const Next = S(
  <>
    <path d="M4 4.8v14.4a1 1 0 0 0 1.55.83l10.6-7.2a1 1 0 0 0 0-1.66L5.55 3.97A1 1 0 0 0 4 4.8z" />
    <rect x="17" y="4" width="3.4" height="16" rx="1.2" />
  </>
)
export const Prev = S(
  <>
    <path d="M20 4.8v14.4a1 1 0 0 1-1.55.83l-10.6-7.2a1 1 0 0 1 0-1.66l10.6-7.2A1 1 0 0 1 20 4.8z" />
    <rect x="3.6" y="4" width="3.4" height="16" rx="1.2" />
  </>
)
export const Heart = S(<path d="M12 20.6 4.3 13.2a4.9 4.9 0 0 1 6.9-6.9l.8.8.8-.8a4.9 4.9 0 0 1 6.9 6.9z" />)
export const HeartOutline = S(
  <path d="M12 20.6 4.3 13.2a4.9 4.9 0 0 1 6.9-6.9l.8.8.8-.8a4.9 4.9 0 0 1 6.9 6.9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
)
const shufflePath = (
  <path
    d="M2.5 6.5h3.2c1.7 0 3.3.9 4.2 2.3l3.6 6.4c.9 1.4 2.5 2.3 4.2 2.3h3.8M18.5 14.5l3 3-3 3M2.5 17.5h3.2c1.7 0 3.3-.9 4.2-2.3M13.6 8.8c.9-1.4 2.5-2.3 4.2-2.3h3.7M18.5 3.5l3 3-3 3"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
)
export const Shuffle = S(shufflePath)
export const SmartShuffle = S(
  <>
    <g transform="translate(3 3) scale(.85)">{shufflePath}</g>
    <path d="M4.5 0l1.1 3.2L8.8 4.3 5.6 5.4 4.5 8.6 3.4 5.4.2 4.3l3.2-1.1z" />
  </>
)
const repeatPath = (
  <path
    d="M17 2.5l3 3-3 3M4 11.5V9.5a4 4 0 0 1 4-4h12M7 21.5l-3-3 3-3M20 12.5v2a4 4 0 0 1-4 4H4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
)
export const Repeat = S(repeatPath)
export const RepeatOne = S(
  <>
    {repeatPath}
    <text x="12" y="15.2" fontSize="8" fontWeight="800" textAnchor="middle" fontFamily="Montserrat, sans-serif">
      1
    </text>
  </>
)
export const Expand = S(
  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
)
export const Collapse = S(
  <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
)
export const MiniPlayer = S(
  <>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <rect x="12" y="11.5" width="7" height="6" rx="1" />
  </>
)
export const Mic = S(
  <>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </>
)
export const Speaker = S(
  <>
    <path d="M3 9.5v5h4l5 4.5v-14L7 9.5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </>
)
export const Muted = S(
  <>
    <path d="M3 9.5v5h4l5 4.5v-14L7 9.5z" />
    <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </>
)

// Full screen on the PC: a monitor, so it can't be mistaken for an exit button
export const Monitor = S(
  <>
    <rect x="2.5" y="4" width="19" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8.5 20.5h7M12 16.5v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </>
)

// PC stats
export const Chip = S(
  <>
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </g>
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
  </>
)
export const Ram = S(
  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="9" rx="1.5" />
    <path d="M6 16v3M10 16v3M14 16v3M18 16v3M6 10.5v2M10 10.5v2M14 10.5v2M18 10.5v2" />
  </g>
)
export const Therm = S(
  <>
    <path d="M10 14.5V4.5a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17.5" r="2" />
  </>
)

// Weather, in colour
const sun = (
  <>
    <circle cx="12" cy="12" r="5" fill="#ffd36b" />
    <path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" stroke="#ffd36b" strokeWidth="2" strokeLinecap="round" />
  </>
)
const moon = <path fill="#ffd77a" d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
const cloud = (y = 0, fill = '#dfe6f5') => <path fill={fill} transform={`translate(0 ${y})`} d="M7 19h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 9.5 4.8 4.8 0 0 0 7 19z" />
export const WeatherIcon: React.FC<{ kind: string; day: boolean; size?: number }> = ({ kind, day, size = 24 }) => {
  let body: React.ReactNode
  switch (kind) {
    case 'clear':
      body = day ? sun : moon
      break
    case 'partly':
      body = (
        <>
          <g transform="translate(-3 -4) scale(.8)">{day ? sun : moon}</g>
          {cloud(1.5)}
        </>
      )
      break
    case 'fog':
      body = (
        <>
          {cloud(-4)}
          <path d="M4 19.5h16M6 22.5h12" stroke="#dfe6f5" strokeWidth="2" strokeLinecap="round" />
        </>
      )
      break
    case 'rain':
      body = (
        <>
          {cloud(-4)}
          <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="#8fc1ff" strokeWidth="2" strokeLinecap="round" />
        </>
      )
      break
    case 'snow':
      body = (
        <>
          {cloud(-4)}
          <path d="M8 19.5h.01M12 21h.01M16 19.5h.01" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </>
      )
      break
    case 'storm':
      body = (
        <>
          {cloud(-4, '#c9cfdd')}
          <path d="M13 15l-3 4.5h3l-2 4" fill="none" stroke="#ffd36b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
      break
    default:
      body = cloud()
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {body}
    </svg>
  )
}
