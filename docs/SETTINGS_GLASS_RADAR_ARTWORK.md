# Transparente Settings, Gratis-Radar und Cover-Erkennung

Stand: 31.10.2026.

## Oberfläche

Die neutralen Karten in allgemeinen Settings, Profil, Downloads, System, Plugins, Add-ons, Gameplay-Overlay und Clip-Einstellungen verwenden eine gemeinsame transparente Oberfläche mit 2 % Weiß. Die transparenten Hintergrundklassen stehen direkt in den Komponenten; deckende Hintergrundklassen werden nicht mehr durch einen zweiten CSS-Selektor überstimmt. Die Settings und Sidebar importieren ihr Material-CSS auch direkt. Eingabefelder bleiben leicht abgesetzt; ausgewählte Sound-Presets behalten eine erkennbare Markierung. Die Karten benötigen keinen eigenen Backdrop-Blur.

Das Profilmenü verwendet eine dunkle Fläche mit 58 % Deckkraft und 28 px Blur. Ein Portal nach `document.body` löst es aus der Sidebar-Ebene. Ankerposition, Fensteränderungen, Klicks innerhalb/außerhalb und Escape werden weiterhin berücksichtigt; Resize-/Fokus-Listener existieren nur bei geöffnetem Menü. Profilkopf und Menü bilden eine gemeinsame Glasfläche; Position und Text bleiben beim Öffnen konstant. Bei Fokusverlust entfällt der Blur und die Deckkraft steigt auf 98 %, sodass Navigationstexte nicht scharf durchscheinen. Der Geschenk-Eintrag heißt „Free Games“ und öffnet den Bereich `free-games` einschließlich Navigation und TopBar-Titel. Die aktuelle Maus- und Geometrieprüfung ist in `PROFILE_LIGHTING_INSTALLATION.md` dokumentiert; Scroll-Messungen stehen in `SCROLL_AND_PROFILE_POLISH.md`.

## Weicher Rand der Spielansicht

Die feststehenden Such- und Filterleisten in Bibliothek und Katalog verwenden jetzt ebenfalls 18 px Backdrop-Blur. Die gemeinsame Materialregel hatte ihren vorhandenen Blur zuvor zurückgesetzt. Die gezielte Regel für `.launcher-toolbar.sticky` erhält die Hintergrundfarben; außerhalb des Fokus entfällt der Blur und eine Tönung mit 94 % Deckkraft hält durchscrollende Cover gedämpft. Es entsteht kein JavaScript-Animationstakt. Die GPU-Pixelprüfung scrollt ein Streifenmuster tatsächlich unter beide Leisten: mit Blur rund 5 Kontraststufen, ohne Blur rund 143, außerhalb des Fokus höchstens 19. Build und Electron-Prüfung bestanden. Nachweise: `tests/sticky-toolbar-build.log`, `tests/sticky-toolbar-electron.log`, `.cache/glass-radar/toolbars/verification.json`.

Das Hero-Artwork kombiniert den vorhandenen unteren Auslauf mit einer seitlichen Maske von 80 bis 144 px. Die beiden Masken werden geschnitten. Titel, Buttons und die Spielansicht selbst erhalten keine Maske. Die Tönung der oberen Leiste läuft ebenfalls von links aus; der Header-Blur bleibt erhalten. Es entsteht kein zusätzlicher JavaScript-Animationstakt.

Die Renderer-Prüfung misst den tatsächlichen Pixelkontrast eines Streifenmusters hinter dem geöffneten Menü, einmal mit und einmal ohne Blur. Zusätzlich misst sie den seitlichen Helligkeitsverlauf eines kontrollierten Testbildes und prüft unmaskierte Bedienelemente. Die Settings-Farbe wird auch nach Entfernen der Materialklasse geprüft, um die direkten Hintergrundklassen zu verifizieren. Protokolle: `tests/material-edge-check.log`, `tests/material-edge-electron.log`.

Diese Nachprüfung ist bestanden: Typecheck, 140 Unit-Tests, Produktionsbuild und die GPU-Electron-Regression einschließlich Pixelmessungen und elf Vorschau-Rückwegen. Bericht: `.cache/glass-radar/material-edge-verification.json`; Screenshots: `.cache/glass-radar/profile-glass.png`, `.cache/glass-radar/game-edge-fade.png`.

## Free Games Radar

Die Angebote und manuelle Prüfung liegen in `FreeGamesView`. Der bisherige Radar-Block und seine Ladezustände entfallen aus den allgemeinen Einstellungen. Der automatisch gespeicherte Benachrichtigungsschalter liegt unter Benachrichtigungen.

Ein gemeinsamer Query-Cache erhält geladene Angebote bei Navigation. Manuelle Mehrfachklicks starten keine parallelen Prüfungen. Fehlgeschlagene Prüfungen behalten bestehende Angebote und zeigen einen Fehlerzustand. Eine erfolgreiche leere Antwort entfernt veraltete Angebote. Store- und Client-Links verwenden die vorhandene Desktop-Schnittstelle. Die Hintergrundsuche bleibt beim bestehenden Dienst.

## Cover

- Eigene offizielle Hochformat-Cover behalten Vorrang.
- Demo-/Playtest-Titel mit fehlendem Poster suchen ihr Hauptspiel über die bestehende Steam-Suche. Nur ein exakter normalisierter Titelabgleich erlaubt dessen Artwork. Es gibt keine pauschale Auswahl des ersten Suchtreffers. Die Spiel-ID und der Startpfad werden dadurch nicht verändert.
- Auch hashbasierte offizielle Header-/Hero-Pfade dienen als Rückfall, wenn ein Titel kein Hochformat veröffentlicht hat. Bereits verifizierte Hauptspiel-Cover werden über die vorhandene URL-Historie wiederverwendet.
- Fehler beim eigentlichen Anzeigen/Decodieren eines vorbereiteten Bildes führen zur nächsten Quelle. Die defekte URL wird innerhalb der Sitzung übersprungen. Neue Titel-/Icon-Daten und eine wiederhergestellte Verbindung können eine vorherige Ersatzgrafik erneut auflösen.
- Eine sichtbare Karte, die sich an einen gerade abgebrochenen Startup-Auftrag gehängt hat, startet einen eigenen Versuch. Abbruch und vorübergehende Nichterreichbarkeit werden dadurch nicht als endgültiges fehlendes Cover behandelt.
- Wo kein nutzbares Originalbild verfügbar ist, bleibt die bestehende Ersatzgrafik.

## Verifikation

`tests/related-artwork.test.cjs` und Ergänzungen in `tests/startup-library.test.cjs` prüfen exakte Titelzuordnung, parallele Anfragen, Unicode-Marken, Demo-Suffixe, offizielle Hash-Pfade, Decodierfehler und den Übergang vom abgebrochenen Startup zur sichtbaren Bibliothek.

`tests/glass-radar-smoke.cjs` prüft die berechneten Glasflächen, Menü-Blur samt Fokuswechsel, Geschenk-Navigation, Radar-Erfolg/Fehler/leere Antworten und die beiden Demo-Cover im GPU-Renderer. Die Renderer-Prüfung verwendet isolierte Testdaten und Bilder. Die separat live geprüften Originalcover für Invokyr Demo und Screen Stocks Demo stehen in `.cache/glass-radar/live-covers.json`; beide lieferten HTTP 200 und wurden visuell als Hochformat-Cover geprüft.

Protokolle: `tests/glass-radar-check.log`, `tests/glass-radar-cover-tests.log`, `tests/glass-radar-electron.log`, `tests/glass-radar-final-electron.log`. Screenshots und Renderer-Ergebnisse: `.cache/glass-radar/`.

Abschlussprüfung: Typecheck, alle 140 Unit-Tests und Produktionsbuild bestanden. Die abschließende GPU-Electron-Regression bestand mit Glas-/Radar-/Cover-Prüfungen, Autosave, Seiten- und Tabwechseln, Overlay-Akkordeons und allen elf Rückwegen aus Spielvorschauen. Keine Renderer-Fehler; native Ressourcen wurden freigegeben. Vollständiger Bericht: `.cache/glass-radar/electron-verification.json`.
