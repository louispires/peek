## What's new in v0.6.1-louis.8

A fork prerelease with the changes in casi-3/peek PRs #22 to #27, ahead of upstream merging them.

**Pop-ups and live view keep working after sleep** (new in this release)
- After the PC woke from sleep, and sometimes after a restart, the shortcut and "Show live view" did nothing and no pop-ups appeared until Peek was restarted. They now keep working.
- If Frigate isn't reachable yet when Peek starts at login, it keeps trying instead of giving up.
- If another app holds the live view shortcut when Peek starts, Peek keeps trying to claim it for 5 minutes.
- Peek now writes a log, peek.log, in its config folder (tray menu, Open config folder). Attach it when reporting a problem.

### Earlier in this fork

**Overlay stays on its monitor after a restart**
- With two or more monitors, an overlay moved to a non-main monitor came back on the main monitor after restarting the PC. It now stays where you put it.
- Positions you already set are kept. Start this version once before your next restart so it can remember which monitor yours is on.

**Windows updates install again**
- "Install" and "Silent install" in the update window failed on Windows with an EACCES error. They now ask for admin rights and run the installer.
- Both still show the Windows admin prompt, since Peek installs for all users.
- Updating to v0.6.1-louis.6 still used the old code, so it had to be installed by hand once. Later updates work from the update window.

**Live view stays open**
- Detections no longer close the live view. It stays on screen until you close it with the shortcut or its close button.
- Detections that happen while the live view is open don't pop up afterwards.

**Objects per zone**
- Each picked zone can allow only some objects, such as cars in the driveway but people on the front porch.
- Pick them under "Objects in Driveway" (your zone's name) in the "Only pop up in zones" tray menu, or under "Objects in each zone" in Settings.
- A zone with no objects picked still pops up for any object, so existing settings work as before.

**Zoom and resize**
- Scroll over a pop-up or a live view tile to zoom in or out towards the mouse pointer. In a grid, each tile zooms on its own.
- Drag to move around while zoomed in. Double-click to zoom back out.
- Ctrl + scroll makes the window bigger or smaller. In live view, every tile grows or shrinks together.
- Pop-up and live view sizes are saved separately and kept after a restart. "Reset overlay size" in the tray menu puts both back.

**Live view**
- A global shortcut (default Ctrl+Alt+Z, change it in Settings) opens a live view of one camera, or a grid of several, and closes it again.
- Pick the cameras in the tray menu or Settings.

**Zone filter**
- Pick zones and an object pops up only once it enters one of them. Zones come from the Frigate config and from events.
- Audio detections are muted while a zone filter is set, since they carry no zone.

**Pause pop-ups**
- "Pause pop-ups" at the top of the tray menu stops pop-ups for 30 minutes, 1, 3 or 6 hours, or the rest of the day. "Resume pop-ups" ends it early.
- The pause survives a restart. The live view shortcut still works while paused.

**Fixes**
- macOS: Peek is now a universal app that runs on Intel and Apple Silicon Macs. The Mac download was Apple Silicon only, so Intel Macs said "not supported on this Mac".
- Windows: Peek now installs for all users into Program Files. The per-user install crashed on launch on some machines.
- Camera, zone and live view lists no longer jump to the top when you toggle an item.
