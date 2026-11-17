# Eclipse Launcher: technische Überarbeitung

Stand: 29. Oktober 2026. Grundlage ist das vorhandene Arbeitsverzeichnis inklusive
der bereits vorhandenen, umfangreichen unveröffentlichten Änderungen. Diese wurden
weitergeführt. Es wurde kein Commit, Push oder Deployment ausgeführt.

Die anschließende Optimierung von Start und Hintergrundbetrieb ist im
[Performance-Bericht](PERFORMANCE_REPORT.md) einschließlich Messwerten und neuem
Windows-Paket dokumentiert.

## Umfang

Geprüft wurden die Electron-Einstiegspunkte und Dienste, React-Einstiegspunkte und
Ansichten, Stores/Hooks, Quellen- und Steam-Anbindung, Firebase-Social-Code,
Aufnahme-/Overlay-Code, native Helfer, Build-Konfiguration und der ältere
Cloudflare-Worker. Der Schwerpunkt lag auf belegbaren Fehlern, Datenintegrität,
Sicherheit und unnötiger Hintergrundarbeit. Dies ist keine Zusicherung, dass jede
Hardwarekombination, jeder Hoster oder jede externe API fehlerfrei funktioniert.

## Wesentliche Änderungen

### Sicherheitsgrenzen und Dateizugriff

- Electron-Sandbox und Web-Security wieder aktiviert; sicherheitsmindernde
  Chromium-Flags und die ungenutzte Webview-Freigabe entfernt.
- Zentrale IPC-Prüfung: registriertes App-Fenster, erlaubte App-URL und Hauptframe
  müssen zusammenpassen. Externe Seiten und Unterframes erhalten keine
  Launcher-Berechtigungen. Navigation und neue Fenster werden begrenzt.
- Remote-Spielbeschreibungen und Sprach-HTML werden bereinigt. Die CSP erlaubt
  keinen beliebigen Online-JavaScript-Code und keine Inline-Skripte im Release.
- HTTP-Abfragen laufen über eine abbrechbare, größen- und zeitbegrenzte Brücke.
  Damit funktionieren Store-Abfragen auch mit aktivierter Web-Security.
- Lokale Medien werden auf die konfigurierten Clip-Verzeichnisse und passende
  Dateitypen begrenzt. Cache-Queryparameter werden korrekt vom Dateipfad getrennt;
  kanonische Pfade verhindern Ausbruch über Verzeichnisverknüpfungen.
- Controller-Skins liegen als HTML/CSS/JS vor. Ein eng begrenztes
  `eclipse-asset://bundle/controller-skins/`-Protokoll ermöglicht das Laden in einer
  Sandbox ohne `allow-same-origin`; Eingaben werden nur vom Elternfenster angenommen.
- Update-Installer akzeptieren ausschließlich passende HTTPS-Release-URLs des
  Eclipse-Repositories. Downloads werden erst nach vollständigem Empfang veröffentlicht.

### Downloads, Quellen und Entpacken

- Streaming mit Backpressure verhindert unbegrenztes Puffern im RAM.
- Fortsetzen prüft Content-Range und Gesamtgröße; Server ohne Range-Unterstützung
  starten sauber neu. Fortschritt läuft nach Pause/Fortsetzen wieder weiter.
- Begrenzte Redirects, behandelte Schreibfehler und fertig geschriebene Dateien
  vor dem Entpacken. Entpackfehler werden nicht mehr als Erfolg angezeigt.
- Abbruch während einer Link-Auflösung kann keinen verspäteten Download starten.
  Gleichzeitige Starts werden zusammengefasst; Beenden stoppt Sockets und Timer.
- Normale Archiv-URLs werden nicht mehr zuerst vollständig als vermeintliche
  MediaFire-HTML-Seite heruntergeladen. Resolver verwenden getrennte Sessions und
  räumen Listener, Zeitgeber und Interception-Hooks auf.
- Quellen prüfen Schema und HTTP(S)-URLs, behalten Session-Cookies und schreiben
  Caches atomar. Defekte Datensätze können die Oberfläche nicht mehr zum Absturz bringen.
- Archive werden vor der Extraktion auf ausbrechende Pfade und Links geprüft;
  bestehende Junctions/Symlinks im Zielpfad werden abgewiesen.
- Runtime-Entpacker von 7-Zip 21.07 auf den vollständigen 7-Zip 26.05 aktualisiert,
  inklusive RAR/RAR5-Unterstützung. EXE und DLL werden physisch entpackt ausgeliefert.
- Speichergrößen erfassen auch tiefe Spielverzeichnisse mit begrenzter paralleler
  Dateiarbeit und folgen keinen Verzeichnisverknüpfungen.

### Spielstart, Erkennung und Spielzeit

- Spiele starten mit ihrem eigenen Arbeitsverzeichnis über `spawn` ohne
  Ausgabe-Puffer. Startfehler werden erst nach dem Betriebssystem-Ergebnis gemeldet;
  große Logausgaben beenden das Spiel nicht mehr durch ein `execFile`-Pufferlimit.
- Stoppen verwendet den erkannten PID und Argumentlisten statt einer interpolierten
  Shell-Zeile mit Prozessnamen.
- Prozess-Snapshots haben ein Zeitlimit. Fehlerhafte Snapshots beenden keine
  Sitzung; Bootstrap-/Shipping-Prozesswechsel behalten eine Sitzung.
- Wiederverwendete Windows-PIDs gelten nicht mehr als Startzeit. Beliebige
  Java-Prozesse werden nicht pauschal als Minecraft erkannt.
- Der Monitor beendet nicht mehr ungefragt Roblox-Crashhandler oder vermeintliche
  Hintergrundprozesse. Beenden invalidiert laufende asynchrone Erkennungen.
- Prozessmonitor und Oberfläche schreiben erkannte Spielzeit nicht mehr doppelt.
  Bruchteile von Minuten bleiben erhalten; ungültige Zuwächse werden verworfen.
- Roblox-Erlebniszeit schreibt jedes Intervall einmal. Minuten-Tick, Spielwechsel,
  Flush und Stop addieren nicht nochmals dieselbe Sitzung. Gleichzeitige Abfragen
  teilen einen Vorgang und können nach Stop keine Sitzung wiederherstellen.
  Unterschiedliche Erlebnis-IDs bleiben auch bei gleichem Platzhaltertitel getrennt.
- Bibliotheks-Deduplizierung behandelt transitive Aliase und internationale Namen.
  Veraltete Scan-/Metadaten-Ergebnisse überschreiben keine neuere Bibliothek.

### Clips, Controller und Hintergrunddienste

- FFmpeg wird im installierten Paket am physisch entpackten Pfad gefunden.
  Fehlendes FFmpeg erzeugt einen Fehler statt WebM-Daten als MP4 auszugeben.
- Keine hängenden asynchronen Promise-Executors; Konvertierung, Optimierung und
  Export veröffentlichen erst vollständige Ergebnisse. Ein fehlgeschlagener Export
  ersetzt keine vorhandene Datei.
- WebM-Fallbacks verwenden passende Codecs; MP4-Optionen werden nicht auf MKV
  angewendet. Die echte CPU-/Hardware-Auswahl wird berücksichtigt.
- Leere IDs und Dateipfad-Ausbrüche können keine Clips löschen. Clip-Listen löschen
  keine laufenden Aufnahmen oder fremden temporären Dateien.
- Stop während `getUserMedia`, Recorder-Fehler, alte Rotationsergebnisse und
  Thumbnail-Zeitüberschreitungen werden behandelt. Audio-/Bitratenänderungen starten
  einen aktiven Puffer bei Bedarf neu.
- Die bisher nicht implementierte Vollaufnahme wird nicht mehr durch F9 als
  vermeintliche Replay-Aufnahme ausgeführt. Nicht implementierte Codec-/GPU-Vorgaben,
  Audioisolation und automatische Speicherlimits werden ehrlich gekennzeichnet.
- Controller-/Sprachprozesse behandeln Startfehler, verspätete Exit-Ereignisse,
  Wiederanlauf und defekte Pipes. Ein geschlossenes Desktop-Overlay beendet nicht
  die Controller-Eingabe eines weiterhin offenen Stream-Studios.
- Medienabfragen lösen beim Start keine Play/Pause-Aktion mehr aus; Cover-Cache und
  Hintergrundanfragen sind begrenzt.
- Sichtbare Fenster werden nicht mehr regelmäßig aggressiv aus dem RAM gedrängt.
  Manuelle Bereinigung betrifft Launcher-Prozesse statt sämtlicher Benutzerprozesse.
- Entfernte WMIC-Abhängigkeit; Prozesspriorität wird über validierte Node-APIs
  gesetzt und bei Deaktivierung wiederhergestellt. Hardwareabfragen werden geteilt
  und berücksichtigen die Windows-Anzeigeskalierung.
- Die frühere FPS-Anzeige maß DWM/Overlay-Rendering statt tatsächlicher Spiel-FPS.
  Unverfügbare Spiel-FPS werden jetzt als unverfügbar angezeigt.
- Rocket-League-Abfragen sind serialisiert und verwerfen alte Antworten nach
  Playlistwechsel oder Stop. CS2-Events haben Body-Limit, Tokenprüfung und
  Zuschauerfilter; belegte Ports führen nicht mehr zu einem stillen Prozessfehler.

### Oberfläche, Metadaten und Build

- Fenster, zehn Hauptansichten, Spielmodal und HLS-Code werden bedarfsgerecht geladen.
  Vergleich zweier Integrationsbuilds: App-Chunk etwa 894 KB → 149 KB; Controller-JS
  etwa 258 KB → 2,3 KB. Dies misst die Chunk-Aufteilung, nicht die gesamte
  Installationsgröße oder eine prozentuale RAM-/FPS-Verbesserung.
- Zehn falsche Steam-ID-Zuordnungen korrigiert; erfundene Roblox-Spielerzahlen,
  Bewertungen und Metacritic-Werte entfernt. USD-Preise werden nicht als EUR ausgegeben.
- Release-Jahre werden nicht mehr aus Steam-App-IDs erfunden.
- Firebase-Initialisierung wartet auf Auth-Persistenz, teilt parallele Initialisierung
  und kann nach Fehlern wiederholen. Freunde werden in zulässigen Abfrageblöcken
  geladen; unveränderte Listen erzeugen keine neuen Listener.
- Recovery-Keys verwenden kryptographische Zufallswerte. Dies behebt nicht die unten
  beschriebene serverseitige Eigentums- und Wiederherstellungsarchitektur.
- Startprüfungen respektieren deaktivierte automatische Updates, teilen Anfragen,
  behandeln Vorabversionen und begrenzen auch das Lesen des Antwortkörpers.
- Electron 31 → 45, Vite 5 → 8 und aktuelle Build-Plugins. ESM-Konfiguration,
  explizite native Runtime-Dateien, keine Source Maps im ausgelieferten Paket,
  Bereinigung alter Build-Ausgaben und lokale Builds ohne automatisches Publishing.
- `npm test`, `npm run check`, isolierter Electron-Laufzeittest und Windows-CI ergänzt.
  Der Legacy-Worker hat ein eigenes Lockfile und einen Typecheck.

## Verifikation

Am 29.10.2026 erfolgreich ausgeführt:

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` | 92 Tests, 92 erfolgreich, keine übersprungen |
| `npm run typecheck` | Erfolgreich |
| `npm run build:app` | Renderer, Main-Prozess und beide Preloads gebaut |
| `npm --prefix worker run typecheck` | Erfolgreich |
| Electron-Laufzeittest | Fünf Fenster, fünf Hauptansichten, HTTP-Brücke und Controller-Eingabe erfolgreich |
| Laufzeittest aus `app.asar` | Gleiche Prüfungen einschließlich nativer Module erfolgreich |
| Paketinhalt | Keine Source Maps, keine alten `dist-electron/native`-Kopien oder Build-Werkzeuge; 7-Zip-EXE/DLL und FFmpeg vorhanden |
| Windows-NSIS-Installer | Erfolgreich gebaut, Archiv-Integrität mit 7-Zip geprüft; nicht installiert |
| Root-Dependency-Audit | 4 hohe Meldungen derselben transitiven Kette; keine kritischen |
| Worker-Dependency-Audit | 0 Meldungen |
| `git diff --check` | Erfolgreich |

Die Windows-Paketdateien liegen unter `release/rework-validation/`; die entpackte
App unter `release/rework-validation/win-unpacked/Eclipse Launcher.exe`.
Der unsignierte Installer heißt `Eclipse.Launcher.Setup.1.3.2.exe` und ist
167.220.912 Bytes groß. Hash und Prüfergebnisse stehen in
[`verification.json`](../release/rework-validation/verification.json).
Der Installer-Compiler ließ sich in der eingeschränkten Umgebung nicht starten;
der lokale Paketbau gelang außerhalb dieser Einschränkung. Es wurde nichts
installiert oder veröffentlicht.
Die Tests verwenden künstliche Daten und lokale Testserver. Der Electron-Test
führt keine Installation aus und verändert keine echten Konten oder Spielbibliotheken.
In dieser eingeschränkten Windows-Umgebung wurde ausschließlich der Testprozess
mit `--no-sandbox` gestartet. IPC-, CSP-, Web-Security- und iframe-Prüfungen liefen;
die Betriebssystem-Prozesssandbox wurde dabei nicht als erfolgreich getestet ausgegeben.
Der normale Launcher-Build verwendet weiterhin `sandbox: true`.

## Verbleibende Grenzen vor einem öffentlichen Release

1. **Firebase-Kontosicherheit:** Recovery-Secrets liegen weiterhin im gemeinsam
   gelesenen Benutzerprofil; die lokale kanonische UID ist nicht automatisch die
   authentifizierte Firebase-UID. Sichere Regeln, echte Eigentümerschaft und
   Wiederherstellung benötigen eine koordinierte Backend-/Datenmigration. Siehe
   [konkreter Migrationsplan](ACCOUNT_SECURITY_MIGRATION.md). Es liegen keine
   deployten Firestore-Regeln oder administrativen Zugangsdaten im Repository vor.
2. **Legacy-Worker:** Wird vom aktuellen Launcher nicht verwendet und besitzt keine
   hinreichende Authentifizierung. Nicht unverändert öffentlich aktivieren.
3. **Abhängigkeiten:** Das Root-Audit wurde von 32 Meldungen, davon 2 kritisch,
   auf vier hohe Meldungen einer einzigen transitiven Kette reduziert:
   `webtorrent → torrent-discovery → bittorrent-tracker → ip`.
   Der betroffene `isPublic`-Code gehört zur Tracker-Server-Seite; der Launcher
   startet keinen Tracker-Server. Die Meldung bleibt trotzdem offen; ein vom Audit
   vorgeschlagener WebTorrent-Downgrade auf 0.7 wurde nicht vorgenommen.
   Das modernisierte Worker-Projekt hat null Audit-Meldungen.
4. **Hardware und externe Dienste:** Tatsächliche Aufnahme mit GPU/Mikrofon,
   unterschiedliche Controller, exklusives Vollbild, reale Torrents/Hoster,
   Live-Firebase-Regeln, VPN-Programme und Installer-Updates erfordern manuelle
   Tests auf einem normalen Windows-System. Die automatisierten Tests ersetzen
   diese Hardware-/Integrationsprüfung nicht.
5. **Funktionsumfang:** Vollaufnahme, automatische Clip-Speicherbegrenzung,
   isoliertes Spiel-/Discord-Audio und freie Codec-/GPU-Pinwahl sind weiterhin keine
   implementierten Funktionen. Die Oberfläche behauptet dies jetzt entsprechend.
   Rocket-League-Ereignisse aus MMR/Logs bleiben heuristisch.
6. **Signierung:** Es wurde kein Code-Signing-Zertifikat hinterlegt. Ein lokaler
   Installer-Build ist deshalb keine signierte Veröffentlichung.

## Technische Referenzen

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Protocol](https://www.electronjs.org/docs/latest/api/protocol)
- [Vite 8 Migration](https://vite.dev/guide/migration)
- [Aktueller 7-Zip-Download](https://www.7-zip.org/download.html)
- [npm Install-Script-Freigaben](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/)
