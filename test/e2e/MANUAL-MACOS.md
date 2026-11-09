# Peek: macOS hand checks

These cover what the automated macOS run cannot: a real Frigate and camera, real key presses,
macOS notifications, dragging, sleep, login items and how things look. Run them on a real Mac
after the `macos-e2e` workflow is green.

## Get the build
1. Open the latest `macos-e2e` run in the fork's Actions tab and download the `peek-mac-build` artifact.
2. Open the `.dmg` and drag Peek to Applications. Quit any older Peek first.
3. Open Peek from Applications.
   - Pass: it opens, or macOS shows the usual "unidentified developer" prompt (right-click > Open).
   - Fail: macOS says Peek "is damaged and can't be opened".

## Checks

Mark each row Pass or Fail, and add a note for anything odd.

| # | Area | Do this | Pass when | Result |
|---|---|---|---|---|
| 1 | First run | Fill in your real Frigate and MQTT, click Test connection, then Save & start | Test passes; the Peek icon shows in the menu bar; no Dock icon | |
| 2 | Menu bar icon | Switch macOS between light and dark mode | The icon stays visible in both | |
| 3 | Detection | Walk in front of a camera | The card pops up top right within about 2 s and live video plays | |
| 4 | Boxes and size | Look at the card from check 3 | Boxes sit on the moving object; the card's shape matches the camera's | |
| 5 | Focus | Type in another app while a card pops up | Typing continues in that app; Peek does not take focus | |
| 6 | Full screen | Put an app in full screen, trigger a detection | The card shows over the full-screen app | |
| 7 | Spaces | Switch to another desktop (Space), trigger a detection | The card shows on the current Space | |
| 8 | Sound | Menu > Sound on, trigger a detection on a camera with audio | You hear the camera audio | |
| 9 | Click | Click a card | Frigate opens in your browser at that event | |
| 10 | Shortcut | With Safari focused, press Cmd+Option+Z; press it again | Live view opens with the ticked cameras, then closes | |
| 11 | Change shortcut | Settings > Live view, click the shortcut box, press Cmd+Option+L, Save; press it | The box shows the new keys; the new shortcut opens live view; Cmd+Option+Z does nothing | |
| 12 | Notification | Menu > Live view cameras, untick all; press the shortcut | A macOS notification says no cameras are picked (allow notifications if asked) | |
| 13 | Placement | Menu > Set overlay position…, drag the card to bottom left (or to a second display), Lock here; trigger a detection | The card shows where you locked it | |
| 14 | Reset placement | Menu > Reset overlay position; trigger a detection | The card is back top right | |
| 15 | Camera list | Settings, scroll down the camera list, untick a camera low in the list | The list stays where it was | |
| 16 | Sleep | Sleep the Mac for at least a minute, wake it, trigger a detection | The card still pops up | |
| 17 | Dock | Settings > tick Show in Dock, Save; click the Dock icon | A Dock icon appears; clicking it opens Settings | |
| 18 | Open at login | Settings > tick Open at login, Save; log out and back in | Peek starts in the menu bar without opening a window | |
| 19 | Updates | Menu > Check for updates… | "You are up to date", or the update window for a newer release | |
| 20 | Quit | Menu > Quit | The menu bar icon goes away and the shortcut stops working | |

## Clean up
- Settings > untick Open at login, Save, if you don't want it.
- Settings are in `~/Library/Application Support/Peek`.
