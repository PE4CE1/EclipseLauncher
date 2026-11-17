# RAM-Verbrauch des Aufnahmewegs

Stand: 8. November 2026. Diese Änderungen ergänzen die Bibliotheksoptimierung aus `SMOOTHNESS_AND_MEMORY_2.md` und betreffen die Aufnahme, Clip-Verarbeitung und Ressourcenfreigabe.

## Gefundene Ursachen und Änderung

Der bisherige Replay-Pfad hielt aufgenommene Blobs vor. Beim Clippen erzeugte er vollständige ArrayBuffer für aktuelle und vorherige Segmente und übertrug sie per IPC. Während der Verarbeitung existierten dadurch große Datenbestände gleichzeitig im Renderer und Hauptprozess.

Der neue Pfad schreibt die kodierten Daten fortlaufend in temporäre Dateien. Pro IPC-Nachricht werden höchstens 1 MiB übertragen; die ausstehende Schreibwarteschlange im Renderer ist begrenzt. FFmpeg erhält anschließend direkt die Dateipfade. Einstellungen für Auflösung, FPS, Bitrate, Tonspuren und Ausgabedateien bleiben bestehen. Der alte Pufferpfad ist nur für einen älteren Preload ohne neue Replay-API vorhanden; für die Umstellung ist ein vollständiger Neustart notwendig.

Die Dateien gehören dem jeweiligen Renderer. Zufällige Tokens erlauben ausschließlich Zugriff auf dessen eigene Segmente. Eine Snapshot-Lease hält die benötigten Dateien für einen wartenden Clip fest, auch wenn die Aufnahme inzwischen weiterläuft, ihre Historie kürzt oder gestoppt wird. Nach der Verarbeitung werden diese Referenzen freigegeben. Navigation, Renderer-Absturz und Stoppen räumen die Dateien auf. Beim nächsten Start werden ausschließlich bekannte Replay-Dateien von nicht mehr laufenden Sitzungen entfernt.

Die reguläre Aufnahme verwendet vollständige, abgeschlossene Containersegmente. Das bestehende Zusammenfügen und Trimmen bleibt erhalten. Es werden keine Frames zur RAM-Ersparnis ausgelassen und keine konfigurierten Qualitätswerte heruntergesetzt. Langsame oder volle temporäre Datenträger erzeugen eine sichtbare Fehlermeldung statt stiller Datenverluste. Der temporäre Speicher hat ein begrenztes Budget; bei den gemessenen 60 Sekunden waren ungefähr 83 MiB Videodaten auf dem Datenträger.

## Weitere Ressourcen

- Der Clip-Editor und Trailer-Player pausieren nicht nur: Beim Entfernen ihrer DOM-Knoten werden Medienquellen getrennt und die Decoder ausdrücklich zurückgesetzt. Die Wiederholung von React-Effekten im Entwicklungsmodus wird berücksichtigt.
- Nach Aufnahmeende beziehungsweise dem Abbau eines schweren Editors fordert Eclipse zeitversetzt im Leerlauf die Freigabe unbenutzter Medien-Caches an, sobald kein Player und keine Aufnahme mehr aktiv ist. Beim erneuten Start entfällt die ausstehende Freigabe. Dafür wird die für solche Übergänge vorgesehene [Electron-API `webFrame.clearCache`](https://www.electronjs.org/docs/latest/api/web-frame#webframeclearcache) verwendet. Die sichtbaren Oberflächen werden nicht umgestaltet.
- Vorschaubilder liegen als identische JPEG-/PNG-/WebP-Dateien außerhalb der Metadaten. Vorhandene Base64-Vorschaubilder werden beim Auflisten automatisch migriert. Dies beseitigt wiederholte große JSON-Kopien; im untersuchten Profil war die bisherige Metadatendatei rund 12,8 MB groß.
- Die Metadaten werden bei unverändertem Dateistand nur einmal eingelesen. Externe Dateiänderungen werden erkannt. Eine Umbenennung während einer Vorschaubild-Migration bleibt erhalten.
- Die Aufnahme-Engine besitzt einen vollständigen Lebenszyklus für Store- und IPC-Abonnements. Späte Einstellungsantworten können eine beendete Engine nicht erneut starten. Vite-Updates ersetzen die Engine mit expliziter Freigabe der alten Aufnahme; Clip- und Sprachaktionen verwenden dieselbe aktuelle Instanz.

## Gemessene Ergebnisse

Isolierter Electron-Test mit synthetischem 720p60-Video, 20-Mbit/s-Zielbitrate und einer Minute Replay. Es wurden keine echten Bildschirm- oder Mikrofondaten aufgenommen. Die folgende Tabelle summiert den **privaten Speicher der von Electron gemeldeten Prozesse**; sie beschreibt weder nur den JavaScript-Heap noch exakt die Spalte jeder Task-Manager-Ansicht. Externe FFmpeg-Prozesse sind in dieser Electron-Summe nicht enthalten.

| Phase | Bisheriger Puffer | Dateibasierter Puffer |
| --- | ---: | ---: |
| Vor Aufnahmebeginn | 245 MiB | 245 MiB |
| Nach ca. 60 s Aufnahme | 420 MiB | 413 MiB |
| Größter Messpunkt beim Speichern | 727 MiB | 575 MiB |
| Clip-Editor geöffnet | 877 MiB | 586 MiB |

Die größte Verbesserung betrifft die zusätzlichen Kopien beim Speichern und Öffnen. Bei der laufenden Aufnahme allein war der Unterschied in diesem Test klein. GPU, Encoder und laufende Videobilder benötigen weiterhin Arbeitsspeicher.

Ein zusätzlicher Durchlauf erzeugte und öffnete vier Clips bei weiterlaufender Aufnahme. In den letzten beiden Zyklen lag der private Electron-Speicher bei ungefähr 484–503 MiB. Nach Aufnahmeende, Freigabe der Medien-Caches und Leerlauf waren es ungefähr 339 MiB. Zuletzt meldete die Replay-Verwaltung null Segmente, null Bytes und null Leases. Diese Messungen sind Testwerte und keine feste Obergrenze für beliebige Aufnahmeeinstellungen, echte Spiele oder zusätzliche Fenster.

Es wird für diese Tests kein Working-Set-Trimmer eingesetzt. Die gezielte Freigabe nach Aufnahmeende ist Teil des Produktverhaltens, keine ausschließlich im Benchmark ausgelöste Bereinigung.

## Prüfung und Dateien

Die Unit- und Integrationstests prüfen unter anderem Schreiben und Finalisieren, 1-MiB-Übertragungen, Rückstaugrenzen, Fenster-Isolation, Snapshot-Lebensdauer, Navigation, Aufräumen nach einem Absturz, Thumbnail-Migration und konkurrierende Umbenennung. Ein Test erzeugt mit echtem FFmpeg aus Replay-Dateien einen gültigen Clip und prüft Auflösung und Dauer.

Die Prozessmessungen liegen unter `.cache/ram-replay-20261108/` (`control`, `disk`, `disk-release`, `disk-soak`). `npm run check` führt Typprüfung, Tests und Produktionsbuild aus.

Wesentliche Implementierung:

- `electron/replaySpool.ts`, `electron/replaySpoolIPC.ts`: begrenzte temporäre Dateien und Eigentümer-/Snapshot-Verwaltung.
- `src/services/replayWriter.ts`, `src/services/clipEngine.ts`: kleine, geordnete Schreibblöcke und dateibasierte Aufnahme.
- `electron/clipService.ts`, `electron/clipThumbnails.ts`: direkte Verarbeitung der Dateien, kompakte Vorschaubilder und Metadaten-Cache.
- `src/hooks/useMediaCleanup.ts`, `src/services/mediaMemory.ts`: Decoder- und Cache-Freigabe nach Mediennutzung.
- `src/services/clipEngineLifecycle.ts`: genau eine aktuelle Aufnahme-Instanz, einschließlich Entwicklungs-Updates.
