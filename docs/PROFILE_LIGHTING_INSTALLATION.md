# Profilmenü, Beleuchtung und Installationsstatus

Stand: 31.10.2026.

## Hintergrundbeleuchtung

Der frühere Performance-Mode-Schalter ist durch „Hintergrundbeleuchtung“ ersetzt. Der Standard ist an; ein explizites Aus bleibt beim Laden gespeicherter Einstellungen erhalten. Änderungen verwenden die bestehende automatische Speicherung einschließlich der Desktop-Einstellungen. Die alte Einstellung steuert keine Renderer- oder Prozesspfade mehr. Das automatische Abdunkeln und Pausieren bei Fokusverlust bleibt unabhängig davon aktiv. Die manuelle RAM-Bereinigung bleibt erhalten.

## Installationsstatus

`src/services/gameInstallation.ts` vereinheitlicht die lokale Installationsprüfung für Sidebar, Home-Karten, Bibliothek und Spielvorschau. `installed: false` hat Vorrang vor alten Pfadangaben oder Installationslinks. Wenn beide Einträge eine Steam-ID haben, müssen diese übereinstimmen. Der Fallback ohne ID vergleicht vollständige normalisierte Titel; ein gemeinsamer Titelanfang oder eine installierte Demo genügt nicht. Damit werden Besitz und Steam-Bibliothekseinträge ohne lokale Installation nicht als installiert markiert.

## Profilmenü und Free Games

Profilkopf und Menü bilden eine gemeinsame Glasfläche. Der geschlossene Profilkopf behält seinen Layoutplatz, während der geöffnete Kopf dieselbe Position innerhalb des Portals einnimmt. Das Menü wird erst nach der Positionierung sichtbar; seine Höhe hängt nicht mehr von einer Text-Einblendung ab. Der Pfeil zeigt geschlossen nach unten und geöffnet nach oben. Escape schließt nur das Menü und lässt eine dahinter geöffnete Spielvorschau bestehen.

„Free Games“ ist direkt in der Seitenregistrierung verfügbar. Der Geschenk-Eintrag navigiert dorthin und schließt das Menü. Ein Test klickt mit nativen Mausereignissen nach DOM-Trefferprüfung erstmals aus Home und anschließend aus den Einstellungen und einer geöffneten Spielvorschau darauf.

## Prüfung

- `npm run check`: Typecheck, 145 bestandene Unit-Tests und Produktionsbuild.
- GPU-Electron-Prüfung mit Profil-, Glass-, Navigations-, Library-, Motion- und Atmosphären-Szenarien: bestanden, keine erfassten Rendererfehler.
- Beleuchtung standardmäßig an; Aus wird nativ gespeichert und über Navigation erhalten; An lässt sich wiederherstellen.
- Profilkopfposition und Textbreite vor/nach Öffnen ohne messbaren Versatz (Toleranz 0,01 CSS-Pixel); sieben aufgenommene Frames mit weniger als 0,5 Pixel Geometrieabweichung; keine laufende Textanimation im Menü. Die Scroll-Nachprüfung wiederholt den Positionsvergleich bei DPR 1, 1,25 und 1,5.
- Native Free-Games-Klicks aus drei Ursprungsansichten öffnen die richtige Seite ohne sichtbares Home oder alte Spielvorschau.
- Isolierte Store-Prüfung: uninstalliertes Spiel und ähnlich benannte installierte Demo erhalten kein falsches Installed-Badge; eine bestätigte Installation behält es.

Nachweise: `tests/profile-controls-check.log`, `tests/profile-controls-electron.log`, `tests/installation-badges-electron.log`, `.cache/profile-controls/verification.json`, `.cache/profile-controls/electron-verification.json`, `.cache/store-polish/installation-verification.json`. Ansicht des Menüs: `.cache/profile-controls/attached-profile-menu.png`.
