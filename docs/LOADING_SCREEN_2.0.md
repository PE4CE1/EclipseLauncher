# Eclipse 2.0: Startscreen

Der neue Startscreen verwendet die Eclipse-Farben Schwarz, Orange und dunkles
Rot. Leuchtende Lichtströmungen umgeben eine große, weiche „2.0“. Ihre Ziffern
verschieben und verformen sich mit unterschiedlichen Phasen; zwei Lichtbögen und
ein dunkles Lichtband erzeugen zusätzliche Tiefe. Die Bewegung ist bereits in den
ersten Sekunden sichtbar. Der zentrale Oxanium-Schriftzug bleibt scharf und ruhig.
Der Loader zeigt einen verdunkelten Mond mit wandernder Korona, Lichtpunkt und
einer sich neigenden Umlaufbahn.

Die zusätzlichen Bewegungen animieren ausschließlich Transformationen und
Deckkraft. Farbverläufe, Unschärfe und Schatten werden nicht pro Bild verändert;
es gibt keine JavaScript-Zeichenschleife. Alle Ebenen pausieren bei verborgenem
Fenster und werden bei „Bewegung reduzieren“ statisch dargestellt.

## Integration und Stabilisierung

- `src/components/splash/LaunchScreen.tsx`: Darstellung, Fenstersteuerung und
  Pausieren der CSS-Animationen bei verstecktem Fenster.
- `src/components/splash/LaunchOverlay.tsx`: Ein durchgehender Startscreen als
  Portal direkt im Dokument. Bootstrap, Scan und Updates wechseln nur den Inhalt;
  der animierte Hintergrund wird dabei nicht neu aufgebaut.
- `src/components/splash/launch-screen.css`: Ein gemeinsamer CSS-Hintergrund,
  Typografie und Loader. Der vorherige Wechsel von CSS zu WebGL entfällt.
- `public/fonts/`: Lokal eingebundene Oxanium-Schrift einschließlich SIL-OFL-Lizenz.
  Sie wird früh vorgeladen und benötigt keinen externen Schriftendienst.
- `src/main.tsx`: Stellt den gemeinsamen Startscreen schon vor dem App-Import bereit.
- `SplashView.tsx`: Fortschritt, manueller Start und Update-Anzeige im selben Screen.
- `src/services/startupLibrary.ts`: Wartet auf Scan und Steam-Namensauflösung,
  lädt Cover schon nach den ersten Scan-Ergebnissen parallel zur Namensauflösung
  und begrenzt langsame Startvorbereitung auf 25 Sekunden.
- `src/services/libraryArtwork.ts`: Gemeinsame Cover-Auflösung für Startscreen und
  Bibliothek, mit höchstens zwölf parallelen Vorlade-Aufträgen, bevorzugten Favoriten
  und zuletzt gespielten Titeln sowie wiederverwendetem Cache.
- `src/services/libraryArtworkHistory.ts`: Bis zu 2.048 erfolgreiche Bildadressen
  für höchstens 30 Tage. Schreibvorgänge werden gebündelt; Bilder selbst landen
  nicht im Local Storage. Veraltete Adressen werden bei einem Fehler ersetzt.
- `#launch-preview`: Dauerhafte Vorschau ohne Initialisierung der App-Dienste.

Hintergrund und Loader benötigen keine Video-/Bilddatei, keinen WebGL-Kontext
und keine zusätzliche Grafikbibliothek. Die Schriftdatei umfasst 43.536 Bytes.
Der Schriftzug bleibt beim Wechsel von Bootstrap zu Scan gleich groß;
ein reservierter Aktionsbereich vermeidet einen zusätzlichen Layoutsprung.
Die Hauptansichten werden erst bei Freigabe der Oberfläche eingeblendet.
Die orangefarbene Grundhelligkeit, Spitzenhelligkeit der „2.0“ und ihr Glühen
sind gegenüber der ersten bewegteren Fassung reduziert; Bewegungsabläufe und
lesbarer Schriftzug bleiben erhalten.
Auf Wunsch bleibt der Startscreen jetzt mindestens **3,5 Sekunden** sichtbar.
Die normale Oberfläche wird erst nach Scan, Namensauflösung und Cover-Vorbereitung
freigegeben; große Bibliotheken dürfen länger brauchen. Der Fortschritt zeigt
die tatsächlich bearbeiteten Cover. Das frühere Limit von 80 angestoßenen Bildern
wurde entfernt. Hochauflösende Steam-Poster werden vor breiten Headern bevorzugt,
geladen; die Bibliothekskarten verwenden dieselben URLs und Cache-Einträge.
Bei geeigneten HTTP-Hosts werden nur komprimierte Bilddateien in Chromiums Cache
vorgeladen. Die Antwort wird gestreamt, pro Datei auf 4 MiB begrenzt und nicht als
vollständige Bitmap decodiert. Erst sichtbare Bibliothekskarten decodieren ihre Bilder.
Für eigene Hosts ohne CORS-Unterstützung bleibt natives Bildladen als Alternative
verfügbar. Es gibt keine erzwungenen `Image.decode()`-Aufrufe für die ganze Sammlung.
Der HTTP-Bildcache darf jetzt bis zu 128 MiB auf der Festplatte verwenden,
statt 32 MiB. Das ist ein Speicherplatzlimit und keine RAM-Reservierung
([Electron: disk-cache-size](https://www.electronjs.org/docs/latest/api/command-line-switches#--disk-cache-sizesize)).
Gespeicherte erfolgreiche Adressen vermeiden nach einem Neustart erneute
fehlgeschlagene Posterproben; der HTTP-Cache liefert vorhandene Bilddateien über
`force-cache` ([MDN: Request.cache](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache)).
Eine gespeicherte Adresse allein zählt dabei nicht als geladenes Bild:
die Datei wird weiterhin aus dem Cache oder dem Netzwerk vollständig gelesen.
Die Zeitgrenze pro Bildkandidat umfasst auch eine wartende HTTP/1.1-Ladegruppe;
langsame, gültige Bilder werden dadurch nicht vorzeitig durch Ersatzbilder
ersetzt. Die Bibliotheksvorbereitung bleibt auf 25 Sekunden begrenzt.
Bei fehlenden Bildern oder Netzproblemen gibt es Ersatzbilder und eine Zeitgrenze,
damit der Launcher benutzbar bleibt. Ein abgebrochener Scan kann keine neuere
Bibliothek überschreiben oder den Scan-Status dauerhaft blockieren.
Die Clip-Galerie wird erst beim Öffnen geladen; ihr kompletter Metadatenbestand
wird nicht mehr während des Starts in den Renderer übertragen. Steam-Manifeste,
lokale Steam-Metadaten und die rekursive Suche nach Spieleprogrammen verwenden
asynchrone Dateizugriffe. Veraltete Suchläufe dürfen nach einem Stopp keine
Programme mehr registrieren. Das folgt der Empfehlung, blockierende Arbeit aus
dem Electron-Hauptthread zu entfernen ([Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)).

Bei verborgenem Fenster stoppen die Animationsuhren; die
Systempräferenz „Bewegung reduzieren“ erzeugt eine ruhige Darstellung.

Die „2.0“ ist der Gestaltungsstand für das kommende Interface. Die Release-Version
und der Updater-Versionsvergleich werden durch diese Designänderung nicht umgestellt.

## Vorschau und Prüfung

Nach `npm run check`:

```powershell
$env:ECLIPSE_LAUNCH_PREVIEW = '1'
node tests/run-electron-smoke.cjs --no-sandbox
Remove-Item Env:ECLIPSE_LAUNCH_PREVIEW
```

Die Vorschau-Prüfung schreibt unter `.cache/launch-preview/`:

- `eclipse-2.0.html`: eigenständige, direkt im Browser öffnbare Live-Vorschau,
  ohne Netzwerkzugriffe oder Zugriff auf Launcher-Daten;
- `eclipse-2.0.png` und `eclipse-2.0-small.png`: Aufnahmen des tatsächlichen UI;
- `verification.json`: Ergebnis einschließlich lokaler Schrift, durchgehender
  CSS-Darstellung, Pause/Fortsetzung,
  kleiner Fenstergröße, reduzierter Bewegung und Ausführung der HTML-Vorschau.

Mit `ECLIPSE_PREVIEW_CSS=1` wird zusätzlich ohne GPU geprüft. Der Hintergrund
verwendet dabei denselben Code und dieselben Elemente. `ECLIPSE_PREVIEW_VIDEO=1`
zeichnet zusätzliche Vorschau-Einzelbilder auf. Die Vorschau verändert keine
produktiven Grafik- oder Sicherheitseinstellungen.

`ECLIPSE_SMOKE_MANUAL=1` prüft den manuellen Start im regulären Electron-Smoke-Test
einschließlich des sichtbaren Startbuttons bei 1024 × 640 und des Übergangs zur
Bibliothek. Die Testprofile sind getrennt, sodass parallele Prüfungen ihre Daten
nicht gegenseitig löschen.

Erfolgreich geprüft: TypeScript, Produktionsbuild, 114 automatisierte Unit-Tests,
reguläre Launcher-Navigation, manueller Start, Darstellung mit und ohne GPU und die
eigenständige HTML-Vorschau. Die isolierten Tests benötigten in dieser Umgebung
`--no-sandbox`; die Sicherheitseinstellungen des Launchers wurden nicht gelockert.

Ein zusätzlicher Electron-Test verwendet neun künstliche Steam-Spiele mit
verzögerten Postern: Der Screen bleibt über seine Mindestdauer
hinaus sichtbar, wartet auf alle neun Poster und die Bibliothek zeigt diese ohne
zusätzliche Bildabrufe. Tests decken außerdem mehr als 80 Spiele, Ausfälle,
Abbrüche und die Begrenzung paralleler Bildabrufe ab. Mit
`ECLIPSE_SMOKE_LIBRARY=1 ECLIPSE_SMOKE_STRESS=1` läuft die Electron-Prüfung mit
590 simulierten Steam-Spielen. Ergebnis am 29. Oktober 2026: alle 590 Poster
vorbereitet, exakt ein durchgehender Screen, keine erzwungene Bitmap-Decodierung,
Cache-Wiederverwendung beim Öffnen der Bibliothek sowie nach einem Renderer-Neustart
ohne zusätzliche Bildabrufe und keine Rendererfehler.
Die größte Verzögerung des 50-ms-Renderer-Timers lag im aktuellen Durchlauf
bei 144 ms (isolierter Test mit deaktivierter GPU).
Das ist ein lokaler Test mit künstlichen Bildantworten, keine Messung des echten
Windows-Kaltstarts oder eine Garantie gegen sämtliche Absturzursachen. Für den
gemeldeten ursprünglichen Absturz lag kein auswertbarer Crash-Dump vor.

## Cover-Geschwindigkeit

Ein kontrollierter Vorher-/Nachher-Test mit 590 Bildern benötigt für die
Vorbereitung jetzt **1.610 statt 3.903 ms** (59 % weniger Zeit). Der erste
Cover-Fortschritt erschien nach 118 statt 870 ms. Bedingungen: künstlich
20 ms pro Bildantwort, 50 ms nativer Scan, 750 ms Namensauflösung. Die frühere
Fassung startet sechs, die neue zwölf begrenzte Abrufe und überlappt Bildladen
und Namensauflösung. Pro Durchlauf wurden dieselben 590 Dateien angefordert.

Diese Werte sind eine Messung der Vorbereitung unter kontrollierten Bedingungen,
keine Messung der Internetleitung oder des Windows-Kaltstarts. Das gewünschte
Intro-Minimum von 3,5 Sekunden ist dabei ausgenommen und bleibt bestehen.
Ergebnisse und Vorher-Snapshot liegen lokal unter `.cache/cover-speed/`.
Tests decken die Wiederverwendung erfolgreicher Ersatzbilder nach einem
Renderer-Neustart, veraltete Adressen und fehlgeschlagene Local-Storage-Schreibvorgänge ab.

Oxanium stammt aus dem offiziellen [Google-Fonts-Verzeichnis](https://github.com/google/fonts/tree/main/ofl/oxanium).
Die Lizenz wird zusammen mit der Schrift und in der eigenständigen HTML-Vorschau
mitgeliefert.

Die zuvor gemessenen **192 / 255 / 252 ms** betreffen den schnellen Renderer-Aufbau
vor der gewünschten längeren Startphase. Die aktuelle Freigabe der Oberfläche
wartet bewusst mindestens 3,5 Sekunden und bei Bedarf auf die Bibliothek.
Die früheren Messbedingungen stehen im [Performance-Bericht](PERFORMANCE_REPORT.md).


Current version labels use the central package version (2.0.3). The loading intro intentionally displays only the major/minor line, 2.0.
