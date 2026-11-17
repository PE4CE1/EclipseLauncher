# Flüssigere Oberfläche und begrenzte Speicherhaltung

Stand: 8. November 2026.

Die spätere Untersuchung des gesamten Aufnahmewegs und der Prozessspeicher ist separat in `REPLAY_MEMORY_2.md` dokumentiert. Die folgenden Heap-Messungen beziehen sich ausschließlich auf die Bibliothek.

## Änderungen

Die Bibliothek hält einen Ausschnitt mit Vorlauf im DOM, statt nach einigen hundert Millisekunden sämtliche Karten aufzubauen. `WindowedGrid` misst die tatsächlichen Karten und CSS-Spalten. Platzhalterzeilen berücksichtigen die vorhandenen Abstände, sodass die gesamte Scrollhöhe erhalten bleibt. Ein größerer Puffer mit Sicherheitsabstand verhindert, dass jede überquerte Zeile sofort React-Arbeit auslöst. Scroll-Listener sind passiv; ausstehende Frames und Observer werden beim Verlassen aufgeräumt.

`PosterArt` erkennt bereits geladene Bilder vor dem ersten Paint. Beim Zurückscrollen erscheint dadurch kein neuer Ladeschimmer über einem fertigen Cover. Unveränderte Bildzustände lösen keine zusätzlichen Updates aus.

Die RAM-Caches für vollständige Steam-Details und Suchergebnisse sind auf 64 bzw. 96 zuletzt verwendete Einträge begrenzt. Der vorhandene Festplatten-Cache bleibt erhalten. Nicht mehr verwendete Detailabfragen werden nach zwei Minuten statt bis zu 24 Stunden aus dem React-Query-Cache freigegeben. Aktuell dargestellte Abfragen bleiben erhalten.

Spielansicht und Clips-Übersicht abonnieren gezielt die benötigten Store-Felder. Unbeteiligte Zustandsänderungen müssen dadurch ihre Oberfläche nicht erneut rendern.

Farben, Blur, Filmkorn, Hintergrund, Kartenabmessungen, Abstände und Hover-Gestaltung wurden nicht geändert. Aufnahmeauflösung und Replay-Einstellungen bleiben ebenfalls erhalten.

## Messung mit 590 Spielen

Vergleich zweier isolierter Produktions-Renderer mit GPU, lokalen identischen Testbildern, gleicher Fenstergröße und jeweils drei Scrollläufen. Die Kontrollversion verwendet denselben UI-Code mit vollständig aufgebauter Bibliothek. Der Median der drei Läufe wird für die Rechenzeit verwendet.

| Messung | Vollständiger Aufbau | Optimierter Aufbau |
| --- | ---: | ---: |
| Karten im Raster zu Beginn | 590 | 54 |
| Karten in der Liste zu Beginn | 590 | 15 |
| JavaScript-Heap, Raster | 12,72 MiB | 7,05 MiB |
| JavaScript-Heap, Liste | 12,33 MiB | 6,97 MiB |
| Main-Thread-Zeit beim Raster-Scrollen | 808,75 ms | 625,13 ms |
| Main-Thread-Zeit beim Listen-Scrollen | 1.182,78 ms | 443,83 ms |
| Scrollhöhe Raster | 32.386 px | 32.386 px |
| Scrollhöhe Liste | 53.269 px | 53.269 px |

Das entspricht etwa 44 % weniger JavaScript-Speicher sowie 23 % bzw. 62 % weniger Main-Thread-Arbeit beim Scrollen. Der gesamte Prozess-RAM umfasst zusätzlich Chromium, Grafik, Bilder und gegebenenfalls Aufnahmen; die Heap-Zahlen beschreiben diesen Gesamtverbrauch nicht. Ergebnisse mit echten Bildern und anderen Rechnern können abweichen. Es wird kein Laufzeit-GC oder Working-Set-Trimming zum Erzeugen dieser Einsparung verwendet. GC wurde ausschließlich vor den Test-Speichermessungen ausgeführt.

Kartenkoordinaten und -maße werden automatisch mit der Kontrollversion verglichen. Weitere Prüfungen decken das letzte Spiel, Suche, Favoriten, Ansichtswechsel, Scrollhöhe und Fensterbreiten von 1.024, 1.280, 1.400 und 1.600 Pixeln ab. Ein eigener Integrationstest bestätigt, dass verdrängte Spieldetails aus dem Festplatten-Cache ohne Netzwerkanfrage zurückkehren.

## Dateien und Prüfung

- `src/components/shared/WindowedGrid.tsx`, `src/services/virtualRows.ts`: Kartenfenster und exakte Platzhalterhöhen.
- `src/components/library/LibraryView.tsx`: Verwendung für Raster und Liste.
- `src/components/shared/PosterArt.tsx`: stabile Wiederanzeige gecachter Cover.
- `src/services/lruCache.ts`, `src/services/steamService.ts`, `src/hooks/useGames.ts`: begrenzte Datenhaltung.
- `src/components/shared/GameDetailModal.tsx`, `src/components/clips/ClipsView.tsx`: gezielte Store-Abonnements.
- `tests/virtual-rows.test.cjs`: Geometrie, Cache-Verdrängung und Wiederherstellung vom Datenträger.
- `tests/smoothness-smoke.cjs`, `tests/smoothness-baseline.vite.mts`, `tests/compare-smoothness.cjs`: kontrollierter Electron-Vergleich.

`npm run check` prüft Typen, Tests und den Produktionsbuild. Messwerte, Bildschirmaufnahmen und der automatische Vergleich liegen unter `.cache/smoothness-20261108/`; sämtliche Daten und Fenster des Benchmarks sind vom echten Benutzerprofil isoliert. Die Kontrollkonfiguration wird ausschließlich für Tests gebaut und führt keinen Performance-Schalter in die App ein.
