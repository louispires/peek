## What's new in v0.6.1-louis.1

A fork prerelease with the changes in casi-3/peek PRs #22 to #25, ahead of upstream merging them.

**Live view**
- A global shortcut (default Ctrl+Alt+Z, change it in Settings) opens a live view of one camera, or a grid of several, and closes it again.
- Pick the cameras in the tray menu or Settings. A new detection replaces the live view.

**Zone filter**
- Pick zones and an object pops up only once it enters one of them. Zones come from the Frigate config and from events.
- Audio detections are muted while a zone filter is set, since they carry no zone.

**Pause pop-ups**
- "Pause pop-ups" at the top of the tray menu stops pop-ups for 30 minutes, 1, 3 or 6 hours, or the rest of the day. "Resume pop-ups" ends it early.
- The pause survives a restart. The live view shortcut still works while paused.

**Fixes**
- Windows: Peek now installs for all users into Program Files. The per-user install crashed on launch on some machines.
- Camera, zone and live view lists no longer jump to the top when you toggle an item.
