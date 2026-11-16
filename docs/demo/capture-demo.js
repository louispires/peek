// Renders demo.html frame by frame and builds docs/demo.gif with ffmpeg.
// Run from the repo root: npx electron docs/demo/capture-demo.js
// Set FFMPEG to the ffmpeg binary if it is not on PATH.
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs')

const OUT = path.join(os.tmpdir(), 'peekdemo')
const GIF = path.join(__dirname, '..', 'demo.gif')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const FPS = 12
const WIDTH = 720

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function buildGif() {
  const input = path.join(OUT, 'frame-%04d.png')
  const palette = path.join(OUT, 'palette.png')
  const scale = `fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', input,
    '-vf', `${scale},palettegen=stats_mode=diff`, palette], { stdio: 'inherit' })
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', input, '-i', palette,
    '-lavfi', `${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop', '0', GIF], { stdio: 'inherit' })
}

// A page error would otherwise leave the window open and the script waiting forever.
process.on('unhandledRejection', err => {
  console.error(err)
  process.exitCode = 1
  app.quit()
})

app.whenReady().then(async () => {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  const win = new BrowserWindow({
    width: 900,
    height: 560,
    useContentSize: true,
    show: true,
    frame: false,
    resizable: false,
    webPreferences: { backgroundThrottling: false, zoomFactor: 1 }
  })
  await win.loadFile(path.join(__dirname, 'demo.html'))
  await sleep(600)

  const period = await win.webContents.executeJavaScript('window.__period')
  const frames = Math.round(period / (1000 / FPS))

  win.webContents.on('console-message', (_e, _level, message) => console.log('page:', message))

  for (let i = 0; i < frames; i++) {
    const t = (i * period) / frames
    await win.webContents.executeJavaScript(`window.__t=${t};window.__draw(${t});`)
    await sleep(40)
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(OUT, `frame-${String(i).padStart(4, '0')}.png`), img.toPNG())
  }
  console.log(`Captured ${frames} frames in ${OUT}`)

  try {
    buildGif()
    console.log(`Wrote ${GIF}`)
  } catch (err) {
    console.error(`ffmpeg failed (${err.message}); frames are still in ${OUT}`)
    process.exitCode = 1
  }
  app.quit()
})
