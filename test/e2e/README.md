# Peek end-to-end tests

Playwright tests that drive the real Peek app against a fake Frigate server and a fake MQTT broker.
Design notes live in `.plans/e2e-design.md` in the main checkout.

## Run locally

```
npm install
npm run test:e2e -- --project=behaviour
npm run test:e2e -- --project=behaviour -g "C9"      # one row
```

The `behaviour` project runs on Windows and macOS. The `packaged` project runs only on macOS when
`CI` is set, against the built app.

Reports: `test/e2e/report` (HTML), `test/e2e/results/junit.xml`. When a test fails, the fixture
attaches the app's event log and a screenshot of every window to the report.

## Local rules

- Machine lock: a local run creates `.plans/e2e.lock` in the main checkout (branch name and time) and
  deletes it at the end. If another run holds it and it is under 30 minutes old, the run waits and
  retries every 30 seconds. CI skips the lock. Override the path with `PEEK_E2E_LOCK`.
- Your real Peek is never touched. The tests start the app through `harness/boot.js`, which sets
  `userData` to a throwaway temp folder from `PEEK_E2E_USERDATA`. `harness/userdata-guard.js` throws when
  the variable is missing, relative, or points at (or inside) the real Peek folder (`%APPDATA%\Peek`,
  `~/Library/Application Support/Peek`). Never weaken it. `specs/harness.spec.js` tests it.
- The tests register the live view shortcut `CommandOrControl+Alt+Shift+K`, so they do not fight an
  installed Peek that holds `Ctrl+Alt+Z`.
- Nothing is opened or shown for real: links, folders, dialogs, notifications and login items are spied on.

## Writing a spec

```js
const { test, expect } = require('../harness/test')
const { newEvent } = require('../harness/events')

test('C1 ...', async ({ launch, broker, frigate }) => {
  const peek = await launch({ prefs: { dismissSeconds: 3 } })
  await broker.publish('frigate/events', newEvent('e1', 'front_door'))
  await expect.poll(() => peek.eventPayloads().length).toBe(1)
})
```

Fixtures from `harness/test.js`:

- `frigate`: a fake Frigate on a random port (`startFrigate`).
- `broker`: a fake MQTT broker on a random port (`startBroker`).
- `launch({ config, prefs, env, ready })`: starts Peek on a fresh userData folder and closes it after the test.
  `config` is merged over `{ frigateUrl, mqtt }` (the fake servers); `config: null` means first run, with no
  `config.json`. `ready` (default true) waits until Peek subscribed to `<prefix>/events`, the tray lists
  the cameras from `/api/config` and the overlay script is loaded. `launch.relaunch(handle)` restarts on the same folder.
- `expectOverlayBounds(peek, expected, options)`: polls the overlay bounds; allows one pixel on a fractional display scale.

The handle returned by `launch`:

| Member | Meaning |
|---|---|
| `app` | Playwright `ElectronApplication` |
| `userData`, `readConfig()`, `readPrefs()` | temp folder and its two JSON files |
| `log()`, `records(kind)` | spy records (see below), read from the log file |
| `eventPayloads()` | `frigate-event` payloads sent to the overlay, oldest first |
| `overlayWindow()`, `setupWindow()` | the Playwright page of each window |
| `overlayState()` | `{ visible, focused, bounds }` of the overlay as the main process sees it |
| `windowTitles()`, `workArea()`, `scaleFactor()` | main-process facts |
| `trayMenu()` | latest tray menu as `{ label, type, checked, enabled, submenu }` |
| `clickTray([...labels])` | runs the menu item's click handler (Electron flips checkboxes itself) |
| `exitCode` | promise of the process exit code |

Spy record kinds: `tray-menu`, `notification`, `open-external`, `open-path`, `dialog`, `shortcut-register`,
`relaunch`, `ipc-to-overlay` (`{ channel, payload }`), `login-item`. In the main process, `globalThis.__peekE2E`
holds `records`, `trayMenu`, `notifications` (call `emit('click')`), `shortcuts` (callbacks by accelerator) and
`update` (drives the updater stub: `{ latest }`, `{ error }` or `{ file }` for downloads).

Fake Frigate: `{ url, port, requests, cert, setAuth(auth), holdStream(), releaseStream(), stop() }`.
`requests` holds `{ method, path, query, headers }` for HTTP and WebSocket (`method: 'WS'`) requests.
`holdStream()` makes the WebSocket send no video until `releaseStream()`, so a test can look at the card
before the stream plays. `setAuth` replaces the credentials and invalidates tokens already issued.

Fake MQTT: `{ url, port, publish(topic, payloadOrObject), clients(), subscriptions(), connectCount(), stop(), restart() }`.

Event builders (`harness/events.js`): `newEvent(id, camera, label, score, extra)`, `updateEvent`, `endEvent`.

## Notes

- Waits poll with `expect.poll`; the only fixed sleeps prove that something did NOT happen (1500 ms).
- A row that exposes a real app defect stays in place, marked `test.fail()` with a comment naming the defect.
