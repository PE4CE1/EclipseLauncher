# RAM target, Windows startup and window restoration

Implemented 10 November 2026.

## RAM target

Settings → System & Display → RAM target accepts 256–8192 MB. The default is 1024 MB; 0 disables automatic relief. Presets are 512, 768, 1024, 1536 and 2048 MB. Enter or leaving the field saves a custom value. Invalid values are rejected, failed writes roll back, and rapid preset clicks cannot start duplicate saves.

This is the user-selected **soft target**, not a Windows allocation cap. Temporary overshoots are possible, especially during recording/export. The UI states that explicitly. A hard allocation cap can instead deny allocations and crash a renderer or encoder; none is installed.

The governor samples Electron app memory every 15 seconds, starts cooperative relief at 90% of the target and permits at most one request per minute. The live settings readout refreshes every five seconds only while visible and focused. The measurement aggregates Electron's reported main, renderer, GPU and utility working sets; shared pages may be counted in more than one process, and external encoder/helper processes are not included in this Electron metric.

Relief removes inactive, idle React Query entries without observers and bounded Steam browsing caches. Observed queries (including disabled observers) and in-flight requests are preserved. Heavy media cleanup is deferred while capture or media readers are active. Library files, clips, active recording, exports and downloads are not deleted or stopped. Automatic game-start/game-stop calls use the same cooperative relief path. Automatic EmptyWorkingSet/forced-GC calls were removed; explicit manual RAM cleaning remains available.

## Minimize and restore

One native controller owns initial display, tray reveal, minimize/hide notifications and recovery. It captures its own window rather than a mutable global. A late ready/load/timer callback cannot reopen a window the user already minimized or hid. The normal reveal path restores, shows, focuses and repaints without toggling always-on-top. Hidden autostart stays hidden until explicitly opened. Crash reloads are bounded to avoid a reload loop.

The renderer reconciles native notifications, initial window state, visibility and focus. A missed restore IPC no longer leaves `app-minimized` on the body. Late initial state responses cannot overwrite newer focus/minimize events. Listener and timer cleanup prevents duplicate subscriptions.

## Windows startup

The owned startup entry remains `com.eclipse.launcher`, matching the packaged AppUserModelID. It uses the exact executable path and always includes `--autostart`; minimized startup additionally uses `--hidden`. Developer Electron builds save preferences without registering their development executable. A manually opened installed app still opens normally.

Settings and OS changes now use one serialized settings operation. Startup booleans are validated, Windows registration is checked, disk failures compensate the OS change (including its Windows-approved state), and the renderer rolls back failed saves. Changing only minimized startup preserves an existing Windows-disabled state. The UI reports the actual Windows state and links to Windows Startup Apps. Startup reconciliation respects an entry the user disabled in Windows. Secondary autostart invocations do not pull an existing window into the foreground.

Electron's `launchItems.args` omits switch arguments on this Windows runtime. The exact command is therefore verified with `openAtLogin` using the matching AppUserModelID; the owned `launchItems` record supplies the Windows-approved state. This was checked against the real Windows API, not only a mock.

## Verification

- Regression tests cover thresholds/cooldown/off, active and pending query retention, startup arguments, rollback, Windows-disabled entries, late display callbacks, hidden startup, bounded recovery and stale/missed restore notifications.
- The real Windows API test enables, switches and disables its uniquely named temporary entry, including a path containing spaces. The entry is removed in `finally`. A Windows logoff/login was not performed.
- The settings Electron test checks presets, custom values, invalid input, save failure rollback, startup toggles/status, DE/EN and narrow-window layout.
- The launcher Electron test includes 12 missed-restore recovery cycles and verifies resumed UI animations.
- Evidence: `.cache/autostart-native-verification.json`, `.cache/system-settings-ui.log`, `.cache/system-behavior-electron.log`, `.cache/system-behavior-check.log`.

References: [Electron login item settings](https://github.com/electron/electron/blob/main/docs/api/app.md), [Windows committed-memory limits](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information).
