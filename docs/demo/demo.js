// Demo loop for docs/demo.gif. draw(t) is a pure function of t so capture-demo.js can render
// any frame on demand; the scenes reuse the real overlay's colours, labels and menu wording.

const $ = id => document.getElementById(id)
const card = $('card')
const feed = $('feed')
const fctx = feed.getContext('2d')
const videoBox = $('video')
const grid = $('grid')
const timerBar = $('timer-bar')
const camEl = $('cam')
const closeEl = $('close')
const detectionsEl = $('detections')
const infoEl = $('info')
const captionEl = $('caption')
const keysEl = $('keys')
const cursorEl = $('cursor')
const wheelEl = $('wheel')
const menuEl = $('menu')
const submenuEl = $('submenu')
const trayEl = $('tray')
const trayPausedEl = $('tray-paused')

// Logical size every camera scene is drawn in; canvases scale it to their real size.
const SW = 400
const SH = 225

// Same palette as COLORS in src/renderer/overlay.js.
const RED = '#ff6b6b'
const GREEN = '#51cf66'

const S1 = 0 // several objects, boxes, face, plate, zone, stationary dismiss
const S2 = 7200 // audio detection
const S3 = 11800 // scroll to zoom, Ctrl+scroll to resize, close
const S4 = 19400 // live view shortcut
const S5 = 25400 // tray menu: zone filter and pause
const PERIOD = 31800

const POPUP = [400, 225]
const RESIZED = [512, 288]
const LIVE = [520, 293]

// ---------- helpers ----------

const clamp = v => Math.max(0, Math.min(1, v))
const lerp = (a, b, p) => a + (b - a) * p
const easeOut = p => 1 - Math.pow(1 - p, 3)
const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const seg = (u, a, b) => clamp((u - a) / (b - a))
const inRange = (u, a, b) => u >= a && u < b

// Fades in over 300 ms after `a` and out over 300 ms before `b`.
function window01(u, a, b, fade = 300) {
  if (u < a || u > b) return 0
  return Math.min(clamp((u - a) / fade), clamp((b - u) / fade))
}

function center(el) {
  const r = el.getBoundingClientRect()
  return [r.left + r.width / 2, r.top + r.height / 2]
}

// keys: [[time, point], ...]; a point may be a function so it can follow live DOM positions.
function pathAt(u, keys) {
  const pt = k => (typeof k[1] === 'function' ? k[1]() : k[1])
  if (u <= keys[0][0]) return pt(keys[0])
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const p = easeInOut(seg(u, keys[i - 1][0], keys[i][0]))
      const a = pt(keys[i - 1])
      const b = pt(keys[i])
      return [lerp(a[0], b[0], p), lerp(a[1], b[1], p)]
    }
  }
  return pt(keys[keys.length - 1])
}

// ---------- camera scenes (drawn in SW x SH logical units) ----------

function sky(ctx, top, bottom, horizon) {
  const g = ctx.createLinearGradient(0, 0, 0, horizon)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SW, horizon)
}

function floor(ctx, y, top, bottom) {
  const g = ctx.createLinearGradient(0, y, 0, SH)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, y, SW, SH - y)
}

function glow(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 4, x, y, r)
  g.addColorStop(0, `rgba(${rgb}, ${a})`)
  g.addColorStop(0.4, `rgba(${rgb}, ${a * 0.3})`)
  g.addColorStop(1, `rgba(${rgb}, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SW, SH)
}

function person(ctx, x, groundY, k, t, walking, tone = ['#05070b', '#1a2130']) {
  const swing = walking ? Math.sin(t / 150) * 0.5 : Math.sin(t / 900) * 0.04
  const bob = walking ? Math.abs(Math.sin(t / 150)) * 3 * k : 0
  const y = groundY - bob
  const g = ctx.createLinearGradient(x - 18 * k, 0, x + 18 * k, 0)
  g.addColorStop(0, tone[0])
  g.addColorStop(1, tone[1])
  ctx.save()
  ctx.fillStyle = g
  ctx.strokeStyle = g
  ctx.lineCap = 'round'
  ctx.lineWidth = 9 * k
  ctx.beginPath()
  ctx.moveTo(x, y - 78 * k)
  ctx.lineTo(x, y - 34 * k)
  ctx.stroke()
  ctx.lineWidth = 8 * k
  ctx.beginPath()
  ctx.moveTo(x, y - 34 * k)
  ctx.lineTo(x + Math.sin(swing) * 14 * k, y)
  ctx.moveTo(x, y - 34 * k)
  ctx.lineTo(x - Math.sin(swing) * 14 * k, y)
  ctx.stroke()
  ctx.lineWidth = 7 * k
  ctx.beginPath()
  ctx.moveTo(x, y - 70 * k)
  ctx.lineTo(x + Math.cos(swing) * 13 * k, y - 44 * k)
  ctx.moveTo(x, y - 70 * k)
  ctx.lineTo(x - Math.cos(swing) * 13 * k, y - 44 * k)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y - 90 * k, 11 * k, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  return [x - 20 * k, y - 104 * k, x + 20 * k, groundY + 2]
}

function car(ctx, x, groundY, lightsOn) {
  ctx.save()
  if (lightsOn) {
    const beam = ctx.createLinearGradient(x, 0, x - 150, 0)
    beam.addColorStop(0, 'rgba(255, 240, 200, 0.35)')
    beam.addColorStop(1, 'rgba(255, 240, 200, 0)')
    ctx.fillStyle = beam
    ctx.beginPath()
    ctx.moveTo(x + 4, groundY - 24)
    ctx.lineTo(x - 150, groundY - 40)
    ctx.lineTo(x - 150, groundY + 6)
    ctx.lineTo(x + 4, groundY - 16)
    ctx.fill()
  }
  ctx.fillStyle = '#0a0d14'
  ctx.beginPath()
  ctx.roundRect(x, groundY - 34, 112, 24, 7)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + 22, groundY - 33)
  ctx.lineTo(x + 36, groundY - 52)
  ctx.lineTo(x + 80, groundY - 52)
  ctx.lineTo(x + 96, groundY - 33)
  ctx.fill()
  ctx.fillStyle = 'rgba(120, 150, 190, 0.18)'
  ctx.beginPath()
  ctx.moveTo(x + 30, groundY - 35)
  ctx.lineTo(x + 39, groundY - 48)
  ctx.lineTo(x + 77, groundY - 48)
  ctx.lineTo(x + 88, groundY - 35)
  ctx.fill()
  ctx.fillStyle = '#05070b'
  for (const wx of [x + 24, x + 88]) {
    ctx.beginPath()
    ctx.arc(wx, groundY - 9, 10, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = lightsOn ? '#fff4d6' : '#3a3f4a'
  ctx.fillRect(x + 1, groundY - 28, 5, 4)
  ctx.fillStyle = '#7a1d1d'
  ctx.fillRect(x + 107, groundY - 28, 5, 4)
  ctx.restore()
  return [x - 4, groundY - 58, x + 116, groundY + 2]
}

function box(ctx, b, color) {
  const [x1, y1, x2, y2] = b
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x1, y1, x2 - x1, y2 - y1, 6)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)'
  ctx.shadowBlur = 4
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function finish(ctx, t) {
  ctx.globalAlpha = 0.05
  for (let i = 0; i < 50; i++) {
    const gx = (Math.sin(i * 12.9 + t / 90) * 0.5 + 0.5) * SW
    const gy = (Math.cos(i * 78.2 + t / 70) * 0.5 + 0.5) * SH
    ctx.fillStyle = i % 2 ? '#fff' : '#000'
    ctx.fillRect(gx, gy, 1.4, 1.4)
  }
  ctx.globalAlpha = 1
  const v = ctx.createRadialGradient(SW / 2, SH / 2, 70, SW / 2, SH / 2, 250)
  v.addColorStop(0, 'rgba(0, 0, 0, 0)')
  v.addColorStop(1, 'rgba(0, 0, 0, 0.45)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, SW, SH)
}

const GROUND = 186

function driveway(ctx, t, actors) {
  sky(ctx, '#0f1729', '#1d2a44', GROUND)
  floor(ctx, GROUND, '#232c38', '#141a23')
  ctx.fillStyle = '#121722'
  ctx.fillRect(250, 70, 150, GROUND - 70)
  ctx.fillStyle = '#1a2130'
  ctx.fillRect(268, 104, 112, GROUND - 104)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
  for (let y = 116; y < GROUND; y += 14) {
    ctx.beginPath()
    ctx.moveTo(268, y)
    ctx.lineTo(380, y)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
  for (let i = 0; i < 6; i++) ctx.fillRect(10 + i * 70, GROUND + 18 + (i % 2) * 6, 34, 2)
  glow(ctx, 40, 34, 160, '255, 205, 140', 0.5)
  const boxes = []
  if (actors) {
    if (actors.car) boxes.push([car(ctx, actors.car[0], GROUND + 4, actors.car[1]), GREEN])
    if (actors.person != null) boxes.push([person(ctx, actors.person, GROUND, 1, t, actors.walking), RED])
  }
  finish(ctx, t)
  if (actors && actors.boxes) for (const [b, c] of boxes) box(ctx, b, c)
}

function nursery(ctx, t, rings) {
  sky(ctx, '#3b3f3d', '#2c302e', 160)
  floor(ctx, 160, '#262927', '#1a1c1b')
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  ctx.lineWidth = 1
  for (let x = 20; x < SW; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 160)
    ctx.stroke()
  }
  // crib
  ctx.fillStyle = '#5c625f'
  ctx.fillRect(120, 150, 170, 8)
  ctx.fillRect(120, 92, 170, 6)
  ctx.fillRect(118, 92, 7, 82)
  ctx.fillRect(285, 92, 7, 82)
  for (let x = 136; x < 284; x += 14) ctx.fillRect(x, 98, 3, 52)
  ctx.fillStyle = '#8a908c'
  ctx.fillRect(126, 138, 158, 12)
  ctx.fillStyle = '#9aa09c'
  ctx.beginPath()
  ctx.ellipse(170, 134, 14, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  // mobile
  ctx.strokeStyle = '#6e7471'
  ctx.beginPath()
  ctx.moveTo(205, 0)
  ctx.lineTo(205, 40)
  ctx.moveTo(180, 40)
  ctx.lineTo(230, 40)
  ctx.stroke()
  const sway = Math.sin(t / 500) * 3
  ctx.fillStyle = '#7d8380'
  for (const mx of [180, 205, 230]) {
    ctx.beginPath()
    ctx.arc(mx + sway, 52, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  if (rings) {
    for (let i = 0; i < 3; i++) {
      const p = ((t / 1100 + i / 3) % 1)
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * (1 - p)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(170, 132, 16 + p * 60, -Math.PI * 0.9, -Math.PI * 0.1)
      ctx.stroke()
    }
  }
  finish(ctx, t)
}

function frontDoor(ctx, t, boxes) {
  sky(ctx, '#1a1712', '#2a241b', GROUND)
  floor(ctx, GROUND, '#2b2620', '#191612')
  ctx.fillStyle = '#120f0b'
  ctx.fillRect(220, 40, 92, GROUND - 40)
  ctx.fillStyle = '#3a2a1c'
  ctx.fillRect(228, 48, 76, GROUND - 48)
  ctx.fillStyle = '#c9a25c'
  ctx.beginPath()
  ctx.arc(292, 122, 3, 0, Math.PI * 2)
  ctx.fill()
  glow(ctx, 340, 56, 150, '255, 200, 120', 0.55)
  ctx.fillStyle = '#3d2f22'
  ctx.fillRect(110, GROUND - 3, 230, 5)
  const b = person(ctx, 175, GROUND, 1.2, t, false, ['#2a2622', '#4a3d31'])
  ctx.fillStyle = '#8a6a43'
  ctx.fillRect(160, GROUND - 76, 32, 24)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
  ctx.fillRect(174, GROUND - 76, 4, 24)
  // face detail that rewards zooming in
  ctx.fillStyle = '#d2a982'
  ctx.beginPath()
  ctx.arc(175, GROUND - 108, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2a2622'
  ctx.fillRect(167, GROUND - 120, 16, 5)
  ctx.fillStyle = '#1a1612'
  ctx.fillRect(171, GROUND - 110, 2, 2)
  ctx.fillRect(177, GROUND - 110, 2, 2)
  ctx.fillRect(172, GROUND - 104, 6, 1)
  finish(ctx, t)
  if (boxes) box(ctx, b, RED)
}

function backyard(ctx, t) {
  sky(ctx, '#0c1424', '#18243a', 150)
  floor(ctx, 150, '#14241a', '#0c160f')
  ctx.fillStyle = 'rgba(230, 236, 255, 0.85)'
  ctx.beginPath()
  ctx.arc(320, 40, 13, 0, Math.PI * 2)
  ctx.fill()
  glow(ctx, 320, 40, 90, '200, 215, 255', 0.25)
  ctx.fillStyle = '#081009'
  for (const [tx, r] of [[60, 46], [130, 34], [370, 40]]) {
    ctx.beginPath()
    ctx.arc(tx, 120 - r * 0.6, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(tx - 4, 110, 8, 42)
  }
  ctx.fillStyle = '#1a2018'
  for (let x = 0; x < SW; x += 16) ctx.fillRect(x, 128, 10, 24)
  ctx.fillRect(0, 134, SW, 4)
  const px = 60 + ((t / 30) % 380)
  person(ctx, px, 200, 0.75, t, true)
  finish(ctx, t)
}

function garage(ctx, t) {
  sky(ctx, '#2a2d33', '#1d2026', 170)
  floor(ctx, 170, '#2e3137', '#1b1d21')
  glow(ctx, 200, 0, 220, '220, 235, 255', 0.35 + Math.sin(t / 60) * 0.01)
  ctx.fillStyle = '#c8d6e8'
  ctx.fillRect(160, 4, 80, 4)
  ctx.fillStyle = '#1a1c21'
  ctx.fillRect(20, 60, 70, 6)
  ctx.fillRect(20, 100, 70, 6)
  ctx.fillStyle = '#4b5361'
  ctx.fillRect(28, 46, 18, 14)
  ctx.fillRect(52, 50, 26, 10)
  ctx.fillRect(30, 86, 30, 14)
  car(ctx, 170, 192, false)
  finish(ctx, t)
}

function paint(canvas, painter, t, arg) {
  const ctx = canvas.getContext('2d')
  ctx.setTransform(canvas.width / SW, 0, 0, canvas.height / SH, 0, 0)
  ctx.clearRect(0, 0, SW, SH)
  painter(ctx, t, arg)
}

// ---------- live view grid ----------

const TILES = [
  ['Driveway', driveway, { car: [250, false] }],
  ['Front Door', frontDoor, false],
  ['Backyard', backyard],
  ['Garage', garage]
]
const tileCanvases = TILES.map(([name]) => {
  const tile = document.createElement('div')
  tile.className = 'tile'
  const c = document.createElement('canvas')
  c.width = 520
  c.height = 293
  const label = document.createElement('div')
  label.className = 'tile-name'
  label.textContent = name
  tile.append(c, label)
  grid.appendChild(tile)
  return c
})

// ---------- overlay chrome ----------

function cardAnim(u, inAt, outAt) {
  let p = 0
  if (u >= inAt && u < outAt) p = clamp((u - inAt) / 450)
  else if (u >= outAt) p = 1 - clamp((u - outAt) / 350)
  const e = easeOut(p)
  card.style.opacity = clamp(p * 1.3)
  card.style.transform = `translateX(${(1 - e) * 28}px) scale(${0.98 + 0.02 * e})`
  return p > 0
}

function setSize([w, h]) {
  card.style.width = w + 'px'
  card.style.height = h + 'px'
}

let lastDetections = ''
function setDetections(chips, info) {
  const key = JSON.stringify([chips, info])
  if (key === lastDetections) return
  lastDetections = key
  detectionsEl.innerHTML = chips
    .map(([label, score, color]) =>
      `<div class="chip" style="border-color:${color}"><span>${label}</span><span class="chip-score">${score}%</span></div>`)
    .join('')
  infoEl.textContent = info.join('   ')
  infoEl.style.display = info.length ? 'block' : 'none'
}

function timer(mode, p = 1) {
  if (mode === 'off') {
    timerBar.style.opacity = 0
    return
  }
  timerBar.style.opacity = 1
  timerBar.style.background = mode === 'active' ? 'rgba(220, 60, 60, 0.85)' : 'rgba(255, 255, 255, 0.75)'
  timerBar.style.transform = `scaleX(${p})`
}

function zoom(scale, px, py) {
  videoBox.style.transform = `translate(${px * (1 - scale)}px, ${py * (1 - scale)}px) scale(${scale})`
}

function caption(u, list) {
  for (const [a, b, title, sub] of list) {
    const o = window01(u, a, b)
    if (o > 0) {
      $('caption-title').textContent = title
      $('caption-sub').textContent = sub
      captionEl.style.opacity = o
      captionEl.style.transform = `translateY(${(1 - o) * 8}px)`
      return
    }
  }
  captionEl.style.opacity = 0
}

function keys(list, pressed, opacity) {
  keysEl.innerHTML = list
    .map(k => (k === '+' || k === 'scroll' ? `<span>${k}</span>` : `<kbd class="${pressed ? 'down' : ''}">${k}</kbd>`))
    .join('')
  keysEl.style.opacity = opacity
}

function cursor(pt, opacity, pressed = false, wheel = '') {
  cursorEl.style.opacity = opacity
  cursorEl.style.transform = `translate(${pt[0] - 2}px, ${pt[1] - 2}px) scale(${pressed ? 0.85 : 1})`
  wheelEl.innerHTML = wheel
  wheelEl.style.opacity = wheel ? 1 : 0
}

function menu(rows, open) {
  menuEl.style.display = open ? 'block' : 'none'
  if (!open) return
  menuEl.innerHTML = rows.map(row).join('')
}

function submenu(rows, anchor) {
  submenuEl.style.display = anchor ? 'block' : 'none'
  if (!anchor) return
  submenuEl.innerHTML = rows.map(row).join('')
  submenuEl.style.top = anchor.getBoundingClientRect().top - 5 + 'px'
}

function row(r) {
  if (r === '-') return '<div class="sep"></div>'
  const [text, opts = {}] = r
  const cls = ['mi', opts.hl ? 'hl' : '', opts.dim ? 'dim' : ''].join(' ')
  const tick = `<span class="tick">${opts.tick ? '✓' : ''}</span>`
  const right = opts.sub ? '▸' : opts.accel || ''
  return `<div class="${cls}" data-id="${opts.id || ''}"><span>${tick}${text}</span><span>${right}</span></div>`
}

// Menu items only exist while their menu is open, so keep the last seen spot for the cursor path.
const lastSpot = new Map()
const item = (el, id) => () => {
  const found = el.querySelector(`[data-id="${id}"]`)
  if (found && el.style.display !== 'none') lastSpot.set(id, center(found))
  return lastSpot.get(id) || center(trayEl)
}

// ---------- scenes ----------

function reset() {
  card.classList.remove('live')
  setSize(POPUP)
  zoom(1, 0, 0)
  timer('off')
  cursor([0, 0], 0)
  keys([], false, 0)
  menu([], false)
  submenu([], null)
  trayEl.classList.remove('open')
  trayPausedEl.style.display = 'none'
  closeEl.style.background = ''
}

function sceneObjects(u) {
  const walkEnd = 3800
  const personX = lerp(-20, 130, easeOut(seg(u, 300, walkEnd)) * 0.3 + seg(u, 300, walkEnd) * 0.7)
  const carP = easeOut(seg(u, 1400, 4200))
  const actors = {
    person: u > 300 ? personX : null,
    walking: u < walkEnd,
    car: u > 1400 ? [lerp(420, 268, carP), true] : null,
    boxes: true
  }
  paint(feed, driveway, u, actors)

  const chips = []
  if (u > 600) chips.push(['🧍 Person', 94, RED])
  if (u > 1700) chips.push(['🚗 Car', 89, GREEN])
  const info = []
  if (u > 1100) info.push('👤 Alex')
  if (u > 2700) info.push('🔢 CA 123-456')
  if (u > 800) info.push('📍 Driveway')
  camEl.textContent = 'Driveway'
  setDetections(chips, info)

  if (u < 4600) timer('active')
  else timer('countdown', 1 - seg(u, 4600, 6400))
  cardAnim(u, 300, 6400)

  caption(u, [
    [300, 4300, 'Several objects at once', 'Coloured boxes and chips, with faces, number plates and zones.'],
    [4500, 7000, 'Gone when things stop moving', 'The countdown starts once every object is stationary.']
  ])
}

function sceneAudio(u) {
  paint(feed, nursery, u, u > 200 && u < 3000)
  camEl.textContent = 'Nursery'
  setDetections([['😢 Crying', 88, RED]], [])
  if (u < 2800) timer('active')
  else timer('countdown', 1 - seg(u, 2800, 4000))
  cardAnim(u, 200, 4000)
  caption(u, [[200, 4500, 'Hears things too', 'Frigate audio detections, like crying, barking or a fire alarm.']])
}

function sceneZoom(u) {
  // Card-local point to zoom around: the visitor's face.
  const fx = 175
  const fy = 78
  const resizeP = easeInOut(seg(u, 4400, 5300))
  const size = [lerp(POPUP[0], RESIZED[0], resizeP), lerp(POPUP[1], RESIZED[1], resizeP)]
  setSize(size)

  paint(feed, frontDoor, u, true)
  camEl.textContent = 'Front Door'
  setDetections([['🧍 Person', 97, RED]], ['👤 Sam', '📍 Porch'])
  timer('active')

  const zoomIn = easeInOut(seg(u, 1700, 2600))
  const zoomOut = easeInOut(seg(u, 3300, 3900))
  const scale = 1 + 1.6 * zoomIn * (1 - zoomOut)
  zoom(scale, fx, fy)

  const shown = cardAnim(u, 200, 6900)
  const cardLeft = 900 - 24 - size[0]
  const face = [cardLeft + fx, 44 + fy]
  const pt = pathAt(u, [
    [900, [470, 420]],
    [1600, face],
    [3900, face],
    [4300, () => [900 - 24 - card.offsetWidth * 0.55, 44 + card.offsetHeight * 0.45]],
    [5600, () => [900 - 24 - card.offsetWidth * 0.55, 44 + card.offsetHeight * 0.45]],
    [6500, () => center(closeEl)]
  ])
  const pressed = inRange(u, 6650, 6850)
  let wheel = ''
  if (inRange(u, 1700, 2600)) wheel = '▲<br>▲'
  if (inRange(u, 3300, 3900)) wheel = '▼<br>▼'
  if (inRange(u, 4400, 5300)) wheel = '▲<br>▲'
  cursor(pt, shown ? window01(u, 900, 7100, 250) : 0, pressed, wheel)
  closeEl.style.background = u > 6400 ? 'rgba(0, 0, 0, 0.6)' : ''

  keys(['Ctrl', '+', 'scroll'], inRange(u, 4300, 5400), window01(u, 4000, 5700))
  caption(u, [
    [300, 3950, 'Scroll to zoom', 'Look closer at a face or a number plate, and drag to pan.'],
    [4050, 7400, 'Ctrl + scroll to resize', 'Pop-ups and live view each remember their own size.']
  ])
}

function sceneLive(u) {
  card.classList.add('live')
  setSize(LIVE)
  camEl.textContent = 'Live view'
  TILES.forEach(([, painter, arg], i) => paint(tileCanvases[i], painter, u + i * 700, arg))
  cardAnim(u, 900, 5000)
  const pressed = inRange(u, 600, 1000) || inRange(u, 4700, 5100)
  keys(['Ctrl', '+', 'Alt', '+', 'Z'], pressed, window01(u, 200, 5500))
  caption(u, [[200, 5800, 'Live view on demand', 'Press Ctrl+Alt+Z for one camera or a grid of several.']])
}

const MENU_ROWS = (hl, zonesOpen) => [
  ['Pause pop-ups', { sub: true, id: 'pause', hl: hl === 'pause' }],
  '-',
  ['Cameras', { sub: true }],
  ['Audio labels', { sub: true }],
  ['Only pop up in zones', { sub: true, id: 'zones', hl: hl === 'zones' || zonesOpen }],
  '-',
  ['Sound', { tick: true }],
  ['Show bounding boxes', { tick: true }],
  ['Dismiss when stationary', { tick: true }],
  ['Dismiss after', { sub: true }],
  '-',
  ['Show live view', { accel: 'Ctrl+Alt+Z' }],
  ['Live view cameras', { sub: true }],
  '-',
  ['Settings…'],
  ['Quit']
]

function sceneMenu(u) {
  const open = inRange(u, 700, 4000)
  trayEl.classList.toggle('open', open)

  const zonesOpen = inRange(u, 1300, 2700)
  const pauseOpen = inRange(u, 2800, 4000)
  menu(MENU_ROWS(pauseOpen ? 'pause' : null, zonesOpen), open)
  const porchTicked = u > 2250
  if (zonesOpen) {
    submenu([
      ['Anywhere (no zone filter)'],
      '-',
      ['Driveway', { tick: true }],
      ['Front porch', { tick: porchTicked, id: 'porch', hl: inRange(u, 2000, 2400) }],
      ['Street']
    ], menuEl.querySelector('[data-id="zones"]'))
  } else if (pauseOpen) {
    submenu([
      ['30 minutes'],
      ['1 hour', { id: 'hour', hl: u > 3400 }],
      ['3 hours'],
      ['6 hours'],
      ['Rest of today']
    ], menuEl.querySelector('[data-id="pause"]'))
  } else {
    submenu([], null)
  }

  const pausedFade = 1 - seg(u, 6000, 6400)
  trayPausedEl.style.display = u > 4300 ? 'block' : 'none'
  trayPausedEl.style.opacity = pausedFade

  const pt = pathAt(u, [
    [0, [560, 300]],
    [700, () => center(trayEl)],
    [1400, item(menuEl, 'zones')],
    [2000, item(submenuEl, 'porch')],
    [2600, item(submenuEl, 'porch')],
    [3200, item(menuEl, 'pause')],
    [3600, item(submenuEl, 'hour')],
    [4600, [640, 260]]
  ])
  const pressed = inRange(u, 580, 700) || inRange(u, 2100, 2250) || inRange(u, 3850, 4000)
  cursor(pt, window01(u, 0, 5200, 250), pressed)

  caption(u, [
    [200, 2700, 'Only pop up in chosen zones', 'Keep the driveway and porch, ignore the street.'],
    [2800, 6200, 'Pause pop-ups', 'For 30 minutes up to the rest of the day.']
  ])
}

function draw(t) {
  t = ((t % PERIOD) + PERIOD) % PERIOD
  reset()
  if (t < S2) sceneObjects(t - S1)
  else if (t < S3) sceneAudio(t - S2)
  else if (t < S4) sceneZoom(t - S3)
  else if (t < S5) sceneLive(t - S4)
  else {
    card.style.opacity = 0
    sceneMenu(t - S5)
  }
}

window.__draw = draw
window.__period = PERIOD

function loop() {
  if (window.__t == null) draw(Date.now() % PERIOD)
  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)
