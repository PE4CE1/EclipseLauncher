# Performance-Überarbeitung

Stand: 29. Oktober 2026. Alle Änderungen und das Windows-Paket sind lokal;
es wurde nichts installiert, veröffentlicht oder zu GitHub übertragen.

Spätere Änderung auf Wunsch: Der [2.0-Startscreen](LOADING_SCREEN_2.0.md) bleibt
jetzt mindestens 3,5 Sekunden sichtbar und wartet auf die vorbereitete Bibliothek.
Die folgenden kurzen Startzeit-Messungen und das Paket unter
`release/performance-validation/` dokumentieren den vorherigen Stand. Dieses Paket
enthält die anschließenden 2.0-Design- und Stabilitätsänderungen noch nicht.

Die aktuelle Stabilisierung entfernt den CSS-/WebGL-Wechsel und hält einen
einzigen Startscreen von Bootstrap bis Freigabe der Oberfläche. Cover werden
bevorzugt als komprimierte Dateien vorgeladen; die vollständige Bibliothek wird
nicht mehr erzwungen decodiert. Die Clip-Galerie lädt erst beim Öffnen.
Die rekursive native Spieleerkennung und Steam-Manifestzugriffe sind asynchron.
Ein isolierter Electron-Test mit 590 simulierten Spielen prüfte alle Poster,
einen durchgehenden Screen und Cache-Wiederverwendung erfolgreich; die maximale
Verzögerung des 50-ms-Renderer-Timers betrug im aktuellen Durchlauf
144 ms bei deaktivierter GPU. Details und Messgrenzen stehen
in der [Startscreen-Dokumentation](LOADING_SCREEN_2.0.md).

Die Cover-Vorbereitung läuft inzwischen parallel zur Namensauflösung mit zwölf
begrenzten Ladeplätzen. Erfolgreiche Bildadressen werden gespeichert und der
HTTP-Cache ist auf 128 MiB Festplattenspeicher begrenzt. Im kontrollierten
590-Bilder-Test sank die Vorbereitung von 3.903 auf 1.610 ms (59 % weniger);
das ist keine Messung einer realen Internetverbindung. Der Electron-Test prüft
zusätzlich einen Renderer-Neustart ohne erneute Bildabrufe.

## Ergebnis und Messgrenzen

Die Startoberfläche wird aus lokalem Zustand angezeigt. Netzwerkprüfungen,
Bibliothekssuche, Metadatenkorrekturen und Social-Anmeldung blockieren sie nicht
mehr. Der bewusst gewählte manuelle Scan-Startbildschirm bleibt verfügbar.

Verglichen wurden die vorherige Überarbeitung unter `release/rework-validation/`
und das neue Paket unter `release/performance-validation/`, jeweils aus ihrer
gepackten `app.asar`. Drei Durchläufe pro Paket mit frischem Testprofil:

| Messgröße | Vorher | Nachher |
| --- | --- | --- |
| Oberfläche mit Navigation und Home-Inhalt bereit | 2.262 / 2.366 / 2.324 ms | 180 / 287 / 232 ms |
| Median bis zur Oberfläche | 2.324 ms | 232 ms |
| Renderer-Hauptthreadarbeit über 2 Sekunden, Median | 11 ms | 3 ms |
| Belegter JavaScript-Heap nach dem Start, Median | 8,9 MiB | 8,7 MiB |

Der gemessene Aufbau der Oberfläche ist damit im Median etwa 90 % schneller.
Das ist **keine Messung des vollständigen Windows-Kaltstarts**: Der Test startet
ein isoliertes Electron-Fenster, blockiert externe Netzwerkzugriffe, verwendet
eine leere Bibliothek und deaktiviert die GPU. Der Betriebssystem-Dateicache kann
warm sein. Die Zeit beginnt unmittelbar vor `loadFile`; die Kontrolle prüft
Navigation, Home-Überschrift und das Ende des Startbildschirms in 100-ms-Abständen.
Die 232 ms sind daher kein allgemeines Startzeitversprechen.

Die Hauptthreadmessung beginnt sechs Sekunden nach Bereitschaft und verwendet
Chromium `Performance.TaskDuration`. Der Heap stammt aus `JSHeapUsedSize`.
Beides umfasst weder den gesamten Electron-RAM noch GPU, Aufnahmepuffer oder
native Helfer. Der dauerhafte JavaScript-Speicherbedarf hat sich nur geringfügig
verändert; eine Senkung des gesamten RAM-Verbrauchs wurde nicht quantifiziert.
Null Verbrauch wird nicht behauptet.

## Implementierte Änderungen

- Automatischer Start ohne blockierenden Splash und künstliche Wartezeiten.
  Updateprüfung, Scanner und Social-SDK starten nach dem ersten Bildaufbau.
  Auch die native Steam-/Epic-Erkennung blockiert nicht mehr die Fenstererzeugung.
- Firebase sowie Freunde-, Changelog- und Cinema-Komponenten werden nachgeladen.
  Einmal geöffnete Dialoge behalten ihre Abschlussanimationen.
- Der native Controller-Reader startet bei Bedarf. Vorschau, Overlay und Stream
  teilen sich ihn; Schließen, Neuladen und Renderer-Abstürze geben ihren Bedarf
  wieder frei. Ein noch offener Stream behält seine Controller-Eingaben.
- Der PowerShell-Mediendienst startet erst bei Nutzung. Medienpolling benötigt
  einen sichtbaren Abonnenten; beim Verstecken oder Abmelden wird der Helfer
  angehalten. Einzelne Medienbefehle funktionieren weiter; danach endet ein
  ungenutzter Helfer nach 30 Sekunden.
- Unveränderte Controller-Telemetrie erzeugt keine neuen React-Zustände. Native
  Batterieabfragen werden im versteckten Fenster übersprungen und überlappen nicht.
- Hero-Wechsel und das Vorladen des nächsten Hero-Bilds pausieren ohne Fokus.
  Minimierte Fenster pausieren CSS-Animationen einschließlich Pseudoelementen.
- Performance-Effekte greifen im Hintergrund. Im fokussierten Fenster bleiben
  Schatten, Blur und normale Animationen erhalten.
- Die globale Abschaltung der Chromium-Fensterdrosselung wurde entfernt.
  Unwirksame FPS-Aufrufe für normale Fenster wurden entfernt: Electron
  [`setFrameRate`](https://www.electronjs.org/docs/latest/api/web-contents#contentssetframeratefps)
  gilt für Offscreen-Rendering. Es wird kein fester FPS-Wert für das normale
  Launcher-Fenster behauptet.
- Kein erzwungenes Leeren der Arbeitsspeicher-Seiten bei jedem Fokusverlust,
  Minimieren oder Aktivieren des Performance-Modus. Die explizite Bereinigung
  und die bestehende, seltene Hintergrundbereinigung bleiben verfügbar.
- Persistenz vergleicht die tatsächlich gespeicherten Referenzen vor der
  JSON-Serialisierung. Scanmeldungen speichern nicht wiederholt die ganze
  Bibliothek. Identische Einstellungswerte lösen keine neuen Store-Zustände aus.
- Gezielt abonnierte Store-Werte reduzieren React-Aktualisierungen. Discord
  wird bei einem Downloadwechsel aktualisiert statt bei jedem Fortschrittspaket.
  Der Social-Heartbeat läuft alle 60 statt 15 Sekunden, unterhalb der vorhandenen
  150-Sekunden-Presence-Frist.
- Speicherbereinigung entfernt ausschließlich inaktive React-Query-Einträge.
  Der Entwicklungs-Watcher löscht bei einem Main-Neubau keine Preload-Dateien mehr.

## Verifikation und Paket

- TypeScript-Prüfung, Produktionsbuild und **97 automatisierte Tests erfolgreich**.
- Electron-Smoke-Test gegen Build und gepackte `app.asar`: fünf Fenster,
  fünf Hauptansichten, native Module, IPC und Controller-iframe erfolgreich.
- Zusätzlicher UI-Test: fokussierte Effekte bleiben an; Minimieren pausiert
  Animationen; Wiederherstellen setzt sie fort. Offline-Aufnahme visuell geprüft.
- Regressionstests prüfen den fehlenden Controller-/Medien-Prozessstart ohne
  Bedarf, gemeinsame Nutzung, Freigabe nach Verstecken/Navigation/Absturz,
  übersprungene Persistenz und abbrechbare Hintergrundaufgaben.
- Installer gebaut und mit 7-Zip auf Archivintegrität geprüft; nicht ausgeführt.

Das neue, unsignierte Paket liegt unter `release/performance-validation/`:

- `Eclipse.Launcher.Setup.1.3.2.exe`: 167.223.304 Bytes.
- `win-unpacked/Eclipse Launcher.exe`: direkt startbare entpackte Anwendung.
- `verification.json`: Prüfergebnisse, Hash und beide Benchmark-Protokolle.

SHA-256 des Installers:
`1ac72d61e0feaab4a1510da78207600b0071a6beaa25bb451db95c0639c79e40`.
Die Installergröße bleibt praktisch gleich; die Electron-Laufzeit und die
weiterhin verfügbaren Aufnahme-/Downloadfunktionen bestimmen die Paketgröße.

Der Paketbau benötigte wegen des gesperrten Paketcache-Zugriffs die Ausführung
außerhalb der eingeschränkten Build-Umgebung. Nur die isolierten Electron-Tests
liefen hier mit `--no-sandbox`; der Launcher verwendet weiterhin `sandbox: true`.
Ein echter Kaltstart, Gesamt-RAM/GPU unter realer Nutzung sowie Verhalten mit
laufendem Spiel und aktiver Aufnahme wurden damit nicht gemessen.

## Messung wiederholen

Nach `npm run check` kann ein vorhandenes gepacktes Paket gemessen werden:

```powershell
$env:ECLIPSE_BENCHMARK = 'after'
$env:ECLIPSE_SMOKE_ASAR = "$PWD/release/performance-validation/win-unpacked/resources/app.asar"
npm run test:electron -- --no-sandbox
Remove-Item Env:ECLIPSE_BENCHMARK, Env:ECLIPSE_SMOKE_ASAR
```

Das Ergebnis steht in `tests/performance-after.json`. Ohne
`ECLIPSE_SMOKE_ASAR` wird der aktuelle lokale Build verwendet. In einer normalen
Windows-Umgebung sollte der Test zuerst ohne `--no-sandbox` versucht werden.
