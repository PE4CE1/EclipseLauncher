# Stabile Vorschauen und Overlay-Animationen

## Ursachen und Änderungen

- **Schrift:** Inter wurde sowohl im HTML als auch per CSS aus dem Netz mit `display=swap` geladen. Jetzt wird die lokale variable Latin-Schrift (48.256 Bytes) vorab geladen. Gewichte 100–900, Lizenz und Herkunft liegen unter `public/fonts/`. Damit entfällt ein nachträglicher Wechsel der Schriftmetriken; die lokale Eclipse-Displayschrift bleibt separat.
- **Home-Hero:** Ein sichtbares Slide behält seinen Metadaten-Snapshot. Eine spätere, unvollständigere Feed-Antwort entfernt keine Zeilen während der Darstellung. Genres, Metadaten, Beschreibung und Buttons haben reservierte Bereiche. Die primäre Schaltfläche skaliert beim Hover nicht mehr. Bildwechsel behalten den vorhandenen Crossfade; der Text blendet ohne Positions-/Skalierungsanimation ein. Während einer Spielvorschau werden keine neuen Hero-Frames übernommen.
- **Spielansicht:** Logo und Text teilen einen festen Titelbereich. Die Darstellungsart wird in den ersten 160 ms entschieden; ein späteres optionales Logo ersetzt keine schon sichtbare Überschrift. Der frühere Reset konnte ein bereits geladenes Logo erneut auf „loading“ setzen. Titel, Fakten und Badges verändern jetzt die Position der Aktionsleiste nicht mehr. Die Anordnung richtet sich nach der Breite der eigentlichen Hero-Fläche statt nach der Fensterbreite inklusive Sidebar.
- **Seitenwechsel:** Die Spielansicht wird weiterhin sofort entfernt. Nur die fertige Zielansicht blendet 220 ms ein, ohne Translation oder Skalierung und ohne eine alte Spielseite aufzubewahren. Neue Spielseiten verwenden einen 280-ms-Einblendeffekt. Ein weiterer Wechsel oder Fokusverlust bricht den vorherigen Zieleffekt ab. Reduzierte Bewegung wird berücksichtigt.
- **Overlay-Tab:** Zwölf verschachtelte `height: auto`-/Opacity-Presence-Animationen verwenden jetzt `SmoothCollapse`: eine gemeinsame CSS-Grid-Animation über 260 ms mit sanftem Beschleunigen und Abbremsen. Die Inhalte werden erst bei Bedarf aufgebaut. Verdeckte Bedienelemente sind sofort inert; nach dem Schließen wird ihr Inhalt freigegeben. Ein schneller erneuter Klick behält denselben Bereich, statt alte und neue Presence-Bäume zu überlagern. Erzwungene GPU-Transformationen und Paint-Containment auf den einzelnen Bereichen entfallen. Stabile Scrollbar-Ränder und deaktiviertes Scroll-Anchoring verhindern Breiten-/Scrollsprünge.

## Verifikation

- `tests/store-motion-checks.cjs`: lokal verfügbare Inter-Schrift bei blockiertem externen Netzwerk, konstante Hero-Geometrie bei einem unvollständigen Feed-Refresh, konstante Button-Geometrie beim Hover, verzögertes Logo und verspätete Spielmetadaten. Toleranz für Positions-/Größenänderungen: unter 0,5 CSS-Pixel.
- `tests/ui-motion-smoke.cjs`: tatsächliche Zwischenhöhen beim Öffnen/Schließen, schnelle Umkehr, Freigabe geschlossener Inhalte, stabiler Scrollstand und verschachtelte Bereiche im echten Gameplay-Overlay-Tab. Verdeckte Electron-Testfenster erhalten Capture-Frames, damit ihr Animationstakt tatsächlich fortschreitet.
- Bestehende Tests prüfen weiter elf Rückwege aus der Spielvorschau, Hero-Bildwechsel, Cover-Kanten, Bibliothekscache und Fokus-/Minimierungsverhalten.

Protokolle: `tests/smooth-ui-check.log`, `tests/smooth-ui-build.log`, `tests/smooth-store-build.log`, `tests/smooth-ui-electron.log`, `tests/smooth-store-electron.log`.

Messdaten und Screenshots: `.cache/launcher-atmosphere/overlay-motion-verification.json`, `.cache/store-polish/motion-verification.json`, `.cache/store-polish/game-stable-title.png`.

Stand 30.10.2026: Typecheck, alle 133 Unit-Tests und Produktionsbuild bestanden. Der vollständige Electron-Test mit GPU-, Navigations-, Bibliotheks- und Bewegungsprüfung sowie die abschließende Store-Regression liefen ohne Renderer-Fehler durch. Alle elf getesteten Rückwege aus der Spielvorschau blieben frei von der alten Spielansicht. Die Layout-Prüfung bestätigte weniger als 0,5 CSS-Pixel Abweichung bei verspäteten Daten und Bildern.

## Katalog und einheitliche Seitenwechsel, 31.10.2026

- `SceneTransition` vereinheitlicht die Einblendung der fertigen Zielansicht: 220 ms, Opazität 0,78 bis 1, keine Translation oder Skalierung. Auch ein erstmalig nachgeladenes Seitenmodul wird erfasst. Neue Inhalte werden sofort eingesetzt; es gibt keinen wartenden Ausgangsbaum. Fokusverlust, ausgeblendete Fenster und reduzierte Bewegung brechen den Effekt ab beziehungsweise unterdrücken ihn.
- Alle zehn Hauptansichten verwenden denselben Übergang. Die Settings-Tabs, Bibliotheks-Tabs und Raster-/Listenansichten, Katalog-Ergebnisse sowie Clips Studio und seine Einstellungs-Tabs verwenden denselben Baustein für ihre internen Wechsel.
- Beim Katalog ersetzen 30 geometrisch passende Platzhalter die vorherigen 18 Platzhalter mit abweichenden Textabständen. Fertige Karten haben feste Textzeilen. Die geschätzten Offscreen-Höhen von `content-visibility: auto` entfallen für die begrenzten 30 Katalogkarten. Die große Bibliothek behält ihre Rendering-Optimierung.
- Katalog-Ergebnisse blenden als Gruppe ein. Die zuvor parallel gestarteten Opazitätsanimationen jeder Karte entfallen. Ein ungenutzter zweiter Katalog-Kartentyp wurde entfernt.
- Stabile Scrollbar-Ränder schützen die Breite der Haupt-Scrollbereiche. Der Katalog behält seine Filter auch unter einer Spielvorschau im Layout; die übergeordnete verdeckte und inerte Ansichtenebene übernimmt die Abschirmung. Filter-Akkordeons verwenden `SmoothCollapse`.
- Settings-Tabs starten nicht mehr zusätzlich bei voller Transparenz. Auch Plugins und Add-ons bewegen ihre Überschrift nicht mehr separat. Die Inhalts-Scrollposition wird beim Tabwechsel vor dem nächsten Bild zurückgesetzt; überflüssiges Paint-/Layout-Containment entfällt. Inline definierte Checkboxen und Clip-Einstellungsschalter wurden in stabile Komponenten überführt, damit ein Einstellungs-Update sie nicht neu einhängt.
- Clip-Einstellungen behalten keine ausblendenden alten Tabs mehr. Die gestaffelten Positionsanimationen der Profilkarten entfallen zugunsten des gemeinsamen Seitenübergangs.

`tests/page-motion-smoke.cjs` prüft im GPU-Renderer einen absichtlich verzögerten Katalog, identische Kartenmaße vor/nach dem Laden (Toleranz unter 0,5 CSS-Pixel), stabile Öffnungsbilder, Scrollbar- und Vorschauwechsel, Pagination, neun über die UI erreichbare Hauptansichten, zehn Settings-Tabs, sieben Clip-Tabs, Bibliothekswechsel, beibehaltene Checkbox-DOM-Knoten, schnelle Navigation, reduzierte Bewegung und unfokussierte Fenster.

Protokolle: `tests/catalogue-motion-check.log`, `tests/catalogue-motion-build.log`, `tests/catalogue-motion-electron.log`, `tests/catalogue-motion-regression.log`. Messdaten und Screenshots liegen unter `.cache/page-motion/`.

Verifiziert am 31.10.2026: 133 Unit-Tests, Typecheck und Produktionsbuild bestanden. Die kombinierte GPU-Electron-Regression bestand einschließlich Katalog-/Tab-Messungen, Bibliothekswechseln, aller elf Rückwege aus Spielvorschauen, Overlay-Akkordeons, gemeinsamen Oberflächen und Fokus-/Minimierungsverhalten; keine Renderer-Fehler. Der vollständige Ergebnisbericht liegt unter `.cache/page-motion/electron-verification.json`.

## Settings ohne manuellen Save-Button, 31.10.2026

Der schwebende Save-Button, sein Status/Timer und ungenutzte lokale Optionszustände entfallen. Die Settings verwenden direkt den persistenten Store statt einer zweiten lokalen Kopie. Der bestehende Feld-Setter speichert Änderungen zusätzlich über die Desktop-Schnittstelle; insbesondere Download-Pfad, Steam-Profil-URL, Archivoptionen und VPN-Auswahl benötigen keinen manuellen Abschluss mehr. 21 doppelte Schreibaufrufe entfallen. Der asynchron geladene Standardpfad überschreibt keine zwischenzeitliche Benutzereingabe. Abgelehnte oder fehlgeschlagene Desktop-Speicherungen melden einen Fehler.

Die Electron-Prüfung bestätigt, dass kein Save-Button vorhanden ist und eingegebener Download-Pfad sowie Steam-Profil-URL die Desktop-Persistenz erreichen und nach Verlassen/Öffnen der Settings erhalten bleiben. Typecheck, Produktionsbuild, 133 Unit-Tests und die GPU-Prüfung der Seiten-/Tab- und Overlay-Übergänge sind bestanden, ohne Renderer-Fehler. Protokolle: `tests/settings-autosave-build.log`, `tests/settings-autosave-unit.log`, `tests/settings-autosave-electron.log`. Ergebnis: `.cache/settings-autosave/verification.json`.
