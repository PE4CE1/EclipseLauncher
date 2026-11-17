# Shared dropdowns

`Select` renders the same dark menu, warm selection highlight, checkmark and 160/140 ms enter/exit motion throughout the client. It supports native option groups, disabled items, keyboard navigation, type-to-select, Enter/Space, outside dismissal, Escape focus restoration, reduced motion and viewport-aware placement. A hidden native select preserves form values and the existing change-event contract; the visible control is a labelled combobox button, so no Windows-native selection popup is shown.

Menus mount only while opening/open/closing, and resize/scroll/outside-click handlers exist only while open. There is no polling or permanent animation loop. Closed selections do not start timers. The fullscreen ancestor hosts its menu when needed. Dialog keyboard handlers defer to an open selection so Escape does not also close the editor/dialog or trigger playback shortcuts.

Crosshair categories use the same component, including labelled groups. Settings, microphone/application audio, clip playback/export/filtering, deals, profile sorting, download-source selection and storage sorting are migrated. `DropdownSurface` shares the surface and enter/exit motion with Friends/clip action menus, profile menus and Roblox suggestions; topbar menus use the same surface and motion timings.
