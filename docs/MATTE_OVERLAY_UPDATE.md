# Matte Oberfläche, Overlay und Startübergang

Stand: 30.10.2026.

## Oberfläche

- Anthrazitfarbene Grundflächen und eine sehr dezente, statische Körnung mit 3,2 % Deckkraft.
- Die kleine SVG-Textur wird gekachelt. Sie benötigt keine laufende JavaScript-Animation.
- Die Körnung betrifft den Launcher. Das transparente Spielfenster und der Stream bleiben frei davon.
- Die Shop-Anordnung bleibt bestehen.

## Startübergang

Der vorhandene Ladebildschirm bleibt eine einzige Oberfläche. Wenn die Vorbereitung fertig ist, bewegt er sich innerhalb von 1,8 Sekunden nach oben. Die Bewegung verwendet eine durchgängige Kurve ohne erneutes Beschleunigen an Zwischenpunkten. Eine unabhängig animierte SVG-Maske lässt den unteren Rand in weichen, unregelmäßigen Wellen verschwinden. Der Inhalt blendet dabei früher aus. Die Dauer kommt für CSS und Lebenszyklus aus derselben Konstante; vor dem Entfernen bleibt eine kurze Reserve für den letzten Frame.

Die bestehende Bibliotheksvorbereitung bestimmt weiterhin, wann der Übergang beginnt. Reduzierte Bewegung überspringt die große Bewegung; im Hintergrund wird die Oberfläche zeitnah entfernt. Die Maske wird nur während des Abgangs verwendet.

Relevante Dateien: `src/components/splash/launch-screen.css`, `LaunchOverlay.tsx` und `launchLifecycle.ts`.

Lokale Vorschau: `.cache/launch-preview/eclipse-exit-smooth.mp4`. Die Aufnahme zeigt die tatsächlichen CSS-Animationsphasen mit 60 Bildern pro Sekunde über einem Shop-Testbild.

## Overlay

- Nur eingeschaltete Hardwareanzeigen werden abgefragt. Bei einer reinen Uhrzeitanzeige entfällt der Metrik-Timer.
- Die FPS-Erfassung startet ausschließlich für eine gültige Spiel-PID und eine eingeschaltete FPS-Anzeige.
- Unveränderte Metriken und unveränderte Spielzustände werden nicht wiederholt per IPC übertragen.
- Metrik-Updates aktualisieren die betroffenen Widgets, statt die ganze Overlay-Oberfläche neu zu rendern.
- Der Preload hält den letzten Metrik-Datensatz bereit, damit spät eingeblendete Widgets das erste Update erhalten.
- Beim Spielwechsel werden FPS einer anderen PID ausgeblendet.
- Editor-Bewegungen werden pro Animationsframe zusammengefasst. Beim Loslassen wird die letzte Mausposition übernommen. Die Begrenzung verwendet die gemessene Widget-Größe.
- Ungültige gespeicherte Positionen werden abgefangen. Veraltete Fensterereignisse können ein neues Overlay nicht zurücksetzen.
- NVIDIA-GPU-Abfragen laufen höchstens alle drei Sekunden; bei nicht verfügbarem Werkzeug erfolgt ein erneuter Versuch frühestens nach einer Minute. Fehlende Messwerte erscheinen als unbekannt.

## Echte Spiel-FPS

Die vorherige FPS-Funktion lieferte dauerhaft keinen Messwert. Die neue Erfassung verwendet die offizielle, eigenständige PresentMon-Konsole und berechnet die Bildrate aus `MsBetweenPresents` für die erkannte Spiel-PID. Mehrere Swapchains werden nicht addiert; verwendet wird die aktivste aktuelle Swapchain. Alte Werte verfallen.

Das ist die Präsentationsrate des Spielprozesses. Bildschirm-Hertz oder die Bildrate des Launcher-Fensters werden nicht als Spiel-FPS ausgegeben.

Mitgeliefert wird PresentMon 2.6.0 für Windows x64, rund 980 kB. Quelle, MIT-Lizenz und SHA-256 liegen neben der Datei unter `electron/native/PresentMon/`. Die vorhandene Paketkonfiguration nimmt den Helfer bereits außerhalb des ASAR-Archivs auf.

SHA-256:

```text
b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af
```

Der Helfer verwendet eine eigene ETW-Sitzung. Es werden weder Treiber noch Dienste installiert, keine CSV-Dateien geschrieben und keine fremden ETW-Sitzungen beendet. Die Erfassung von GPU-Zeiten, Eingaben und Display-Verfolgung ist abgeschaltet.

### Windows-Berechtigung

PresentMon benötigt Administratorrechte oder eine Windows-Anmeldung mit Mitgliedschaft in der Gruppe **Performance Log Users / Leistungsprotokollbenutzer**. Eclipse bietet dafür jetzt unter **Einstellungen → Gameplay Overlay → Performance Overlay** den Button **FPS-Zugriff aktivieren** an. Erst dieser ausdrückliche Klick startet die Windows-Freigabe für einen separaten FPS-Helfer. Der Launcher behält normale Rechte; Gruppen, Dienste und Autostart werden nicht verändert. Die Freigabe gilt bis zum Beenden von Eclipse.

Die Prüfung ohne Windows-Freigabe endete mit `access denied`. Das Widget zeigt dafür kompakt **Zugriff**, ohne seine Größe zu ändern. Die Berechnung, PID-Zuordnung, Freigabelogik, die echte Verbindung zum C#-Helfer und die Zurückweisung eines falschen Elternprozesses sind geprüft. Der native Integrationstest löst ausdrücklich keinen UAC-Dialog aus. Eine erfolgreiche ETW-Aufzeichnung eines laufenden Spiels bleibt bis zur Windows-Bestätigung unbestätigt. Auch bei vorhandener Berechtigung hängt ein Messwert davon ab, ob das Spiel passende Präsentationsereignisse liefert.

Offizielle Quellen: [PresentMon 2.6.0](https://github.com/GameTechDev/PresentMon/releases/tag/v2.6.0), [Konsolenoptionen](https://github.com/GameTechDev/PresentMon/blob/v2.6.0/README-ConsoleApplication.md), [Berechtigungen](https://github.com/GameTechDev/PresentMon#permissions).

## Prüfung

- `npm run check`: TypeScript, 126 Tests und Produktionsbuild erfolgreich.
- Electron: Start und Navigation, 590 vorbereitete Bibliothekscover, Wiederverwendung des Bildcaches, Overlay-FPS-Darstellung mit Testdaten, initiale Datenübernahme, PID-Wechsel, Berechtigungsstatus, finales Drag-Ziel und transparente Spielfläche erfolgreich.
- Startbildschirm: bewegter Hintergrund, lokale Schrift, eine durchgängige Oberfläche, Pause im Hintergrund, reduzierte Bewegung, kleines Fenster und der maskierte Abgang geprüft; zusätzlich mit deaktivierter GPU.
- Native PresentMon-Datei gestartet und Hash geprüft. Tatsächliche Spiel-FPS bleiben bis zur erforderlichen Windows-Berechtigung unbestätigt.

Die native Testbereinigung erhält vor dem Beenden von Electron einen weiteren Eventloop-Durchlauf, damit ausstehende native Callbacks freigegeben werden können. Der abschließende Electron-Test endete regulär mit Exitcode 0.

Ergebnisdateien: `tests/matte-overlay-check.log`, `tests/matte-overlay-final.log`, `tests/matte-launch-preview.log`, `tests/matte-launch-software.log` und `.cache/overlay-audit/verification.json`.

Die Verfeinerung des Startübergangs wurde erneut mit `npm run check` und den beiden Electron-Vorschauen geprüft. Aktuelle Protokolle: `tests/launch-smooth-check.log`, `tests/launch-smooth-preview.log`, `tests/launch-smooth-software.log` sowie `.cache/launch-preview/smooth-verification.json`. Die 60-fps-Aufnahme verwendet ein längeres Export-Zeitlimit; die Animation selbst läuft weiterhin ausschließlich über CSS.
