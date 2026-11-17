# Shop-Animationen und Cover für Eclipse 2.0

Stand: 29. Oktober 2026. Die Startseite bleibt der Shop mit Banner, Angeboten,
beliebten und neuen Steam-Spielen. Die Anordnung wurde beibehalten.

## Bannerwechsel

`HeroSection.tsx` wechselt erst, wenn das kommende Bild geladen und decodiert
ist. Die vorherige Bildebene bleibt während der 600-ms-Überblendung vollständig
deckend darunter. Damit entsteht beim gleichzeitigen Aus- und Einblenden keine
dunkle Lücke. Das Logo wird zusammen mit dem Bild vorbereitet; sein Fehlen darf
keinen Wechsel blockieren. Eine Animation vergrößert oder verschiebt die Bilder
nicht mehr. Der Text blendet kurz ohne vertikale Bewegung ein.

Das folgende Spiel wird über denselben Ladepfad vorbereitet. Schnelle Klicks
wählen das letzte gewünschte Ziel; während einer laufenden Überblendung wird
keine zusätzliche Ebene gestapelt. Eine neue Sortierung des Feeds wählt das
aktuelle Spiel über seine App-ID wieder. Automatischer Wechsel pausiert bei
Hover, offenen Spieldetails und fehlendem Fensterfokus. Die Windows-Einstellung
„Bewegung reduzieren“ wird auch während der Laufzeit berücksichtigt.
Die bereits angezeigte Bildinstanz bleibt während des Wechsels im DOM; ein
zusätzlicher Ladevorgang für das ausgehende Bild ist nicht nötig. Jede Bildebene
besitzt einen deckenden Hintergrund, sodass die Bildabdunklung auch in der
Mitte der Überblendung konstant bleibt.

## Karten

Shop- und Katalogkarten verwenden eine kurze Anhebung um drei Pixel und
gezielte Übergänge für Farbe und Deckkraft. Die 3D-Kippbewegung, das pro
Mausbewegung berechnete Glanzlicht und das zusätzliche Verschieben der
Kartenbeschriftung wurden entfernt. Das Öffnen der Spieldetails verändert
nicht mehr die React-Schlüssel aller Karten; ihre Bilder und ihr Zustand
bleiben erhalten. Die Pfeilnavigation scrollt um ganze Kartenbreiten und
berücksichtigt „Bewegung reduzieren“.

## Fehlende Cover

Die bisherige Annahme `…/apps/APPID/library_600x900.jpg` reicht bei aktuellen
Spielen nicht aus. Steam liefert häufig individuelle Pfade wie
`…/apps/APPID/HASH/library_capsule.jpg`. Der neue Dienst `steamArtwork.ts`
fragt die tatsächlichen Asset-Pfade über Steams `IStoreBrowseService/GetItems`
ab. Dabei werden nur offizielle Steam-CDN-Adressen derselben App akzeptiert.
Die Abfrage benötigt keinen hinterlegten API-Schlüssel; Ausfälle bleiben
abgefangen und die bisherigen Bildquellen verfügbar.

Steam unterscheidet Hochformat-Cover, vertikale Store-Kapseln und Querformat-Header
([Steamworks: Graphical Assets](https://partner.steamgames.com/doc/store/assets?language=english)).
Die gemeinsamen Komponenten für Shop, Katalog und Bibliothek bevorzugen echte
Hochformatbilder. Ein Querformatbild ist die letzte Bildalternative und wird
vollständig eingepasst, damit der Titel nicht durch massives Zuschneiden
verloren geht. Das bisherige „PREVIEW“-Badge und der doppelte unscharfe
Bildhintergrund entfallen. Wenn Steam keinerlei brauchbares Bild liefert,
bleibt ein Platzhalter nötig; fremde oder erfundene Bilder werden nicht eingesetzt.

Abfragen werden für bis zu 32 Spiele gebündelt; höchstens zwei Store-Abfragen
laufen gleichzeitig. Erfolgreiche Metadaten werden bis zu sieben Tage lokal
gespeichert, erfolglose Abfragen nur fünf Minuten. Speicher und gespeicherte
URL-Formate sind begrenzt und werden beim Einlesen validiert. Die Abfrage erfolgt
erst, wenn die direkte Coveradresse fehlt oder ein altes Querformat-Ersatzbild
durch ein Hochformatbild verbessert werden kann. Gesunde direkte Cover benötigen
keine zusätzliche Store-Abfrage.

## Prüfung

TypeScript, 118 Unit-Tests und der Produktionsbuild wurden erfolgreich geprüft.
Die Live-Prüfung löst „Moon Sweepers“ zu seinem offiziellen hashbasierten
Hochformatcover auf. Die isolierte Renderer-Prüfung besteht auch mit verzögerter
Bildantwort, schnellen Klickfolgen und einer geänderten Bewegungspräferenz.
Die reguläre Launcher-Prüfung besteht mit 590 simulierten Spielen, fünf Fenstern
und fünf Hauptansichten. Während der Bibliotheksvorbereitung werden keine Cover
erzwungen decodiert. Erst nach Freigabe der Oberfläche werden das sichtbare
Store-Banner und sein Logo gezielt decodiert; das ist getrennt instrumentiert.
Vorbereitete Cover werden in der Bibliothek und nach einem Renderer-Neustart
ohne zusätzliche Bildabrufe wiederverwendet.
Die zusätzliche isolierte Renderer-Prüfung baut ausschließlich eine Testseite:

```powershell
npx vite build --config tests/store-fixture.vite.mts
$env:ECLIPSE_STORE_PREVIEW = '1'
node tests/run-electron-smoke.cjs --no-sandbox
Remove-Item Env:ECLIPSE_STORE_PREVIEW
```

Sie prüft langsame Bilder, durchgehende Bildabdeckung, schnelle Navigation,
Feed-Neusortierung, stabile Karten beim Öffnen von Details, hashbasierte
Hochformat-Cover und den Wechsel der Bewegungspräferenz zur Laufzeit.
`ECLIPSE_STORE_LIVE=1` führt zusätzlich eine Prüfung mit offiziellen Steam-Bildern
durch; sie ersetzt keine reproduzierbare Offline-Prüfung. Die Testseite wird
nicht in den Launcher eingebaut. Protokolle und Aufnahmen liegen lokal unter
`.cache/store-polish/`.

## Vorschläge für den weiteren UI-Feinschliff

- Layout und Shop-Reihenfolge erhalten; keine persönliche Dashboard-Startseite.
- Einheitliche Radien und Linienbreiten; schwächere Rahmen und Schatten.
- Ruhige Abschnittstitel ohne wechselnde Emoji-Stile; Deutsch/Englisch konsistent.
- Orange sparsam für Auswahl und Hauptaktionen; Artwork bleibt der Blickfang.
- Titel klar gewichten, lange Namen vollständig in den Details anzeigen und
  Rabatt, Preis sowie Installationsstatus nicht als konkurrierende Badge-Stapel behandeln.
