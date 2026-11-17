# Deutsch/Englisch: Prüfung der Oberfläche

Stand: 31.10.2026.

## Änderungen

Der Katalog verwendet die gewählte Sprache für Download-Quellen, Suchfelder, Entwickler/Publisher, Sortierung, Jahresfilter, leere Ergebnisse, Detailaktionen, Seitennavigation und Trefferzahlen. „Recent/Earlier Steam listings“ bezieht sich weiterhin auf die Sortierung nach Steam-Einträgen und wird nicht fälschlich als verifiziertes Veröffentlichungsdatum beschrieben. Der bisherige Modern-Filter nennt seine tatsächliche Grenze: Spiele ab 2015. Lange Sortiertexte behalten eine Zeile und sind zusätzlich vollständig als Tooltip lesbar.

Weitere feste Texte wurden in Home-Karten, Bibliothek, Navigation, Profil, Benachrichtigungen, Clip-Einstellungen, Roblox-Ansichten, Overlay-Einstellungen, Videoplayer, Start- und Fehleransicht sowie Steam-Netzwerkinspektor sprachabhängig gemacht. Auch Titel, Platzhalter und zugängliche Beschriftungen sind berücksichtigt. Marken, Dateiformate, API-/Headerdaten, Spieltitel und tatsächlich zu sprechende Sprachbefehle behalten ihre ursprünglichen Bezeichnungen. Bereits korrekt zweisprachige Texte wurden geprüft. Bei den heuristisch erfassten JSX-Kandidaten sank die Zahl von 417 auf 164; verbleibende Kandidaten enthalten solche technischen Daten und bereits sprachabhängig ausgewählte Vorlagenbezeichnungen, keine automatische Garantie oder Fehlerzählung.

Neue Texte stehen als gepaarte Einträge in `src/i18n/interfaceTranslations.ts`. Beide Sprachkataloge enthalten aktuell 669 Schlüssel. `translate.ts` ersetzt alle Vorkommen eines Parameters und behandelt eingefügte Werte wörtlich, einschließlich Dollarzeichen. Sprachwechsel aktualisieren auch memoierte Bibliotheks-Tabs, Sortierung und das HTML-Sprachattribut. Zahlen- und Datumsformate folgen der ausgewählten Sprache. Download- und Spielstartmeldungen verwenden denselben Übersetzungsweg.

Einige vorhandene Formulierungen wurden präzisiert: keine pauschale FPS-/Latenzgarantie bei Hardwarebeschleunigung oder Clips, keine „100 % sicher“-/„Rate-limit immunity“-Behauptungen im Netzwerkinspektor. Das sind Beschriftungen, keine Änderungen am Anfrageverhalten oder an Schutzmechanismen.

## Prüfung

- `npm run check`: Typecheck, 155 bestandene Tests und Produktionsbuild. Zusätzlich letzter Produktionsbuild nach den sprachunabhängigen Navigations-IDs: `tests/i18n-final-build.log`.
- Neue Sprachtests prüfen Schlüsselsymmetrie, nicht leere Werte, gleiche Platzhalter und wörtliche Ersetzung wiederholter Parameter.
- Electron-Sprachwechsel Deutsch → Englisch → Deutsch: Katalogfilter einschließlich Suchfeldern und Leerzustand, Sortierung, Bibliotheks-Tabs, Navigation, HTML-Sprache und Desktop-Speicherung erfolgreich. Die 1234 Testeinträge erscheinen als `1.234 Spiele gefunden` beziehungsweise `1,234 games found`.
- Die vollständige GPU-Oberflächenprüfung einschließlich Profilglas, Vorschau-Rückwegen, Animationen und Aufnahme ausschließlich des isolierten Testfensters ist bestanden. Auch die separaten Store-Prüfungen für Cover, Installations-Badges, Hover und Hero-Wechsel sind bestanden. Die Testfenster-Aufnahme wird im Arbeitsspeicher verworfen und enthält keinen Desktop außerhalb des Testfensters.

Protokolle: `tests/i18n-check.log`, `tests/i18n-electron.log`, `tests/i18n-store.log`. Nachweise: `.cache/i18n/verification.json`, `.cache/i18n/electron-verification.json`, `.cache/i18n/catalogue-de.png`, `.cache/i18n/catalogue-en.png`. `tests/i18n-audit.cjs` kann verbleibende feste JSX-Texte erneut für eine manuelle Prüfung sammeln.

Die Einordnung und Änderungen zu den zuvor gemeldeten Electron-, CORS- und Aufnahmefehlern stehen in `STARTUP_LOG_DIAGNOSTICS.md`. Die bisherigen Tests bestätigen den Aufnahmeweg und Encoder am Testfenster; sie belegen keine universelle Kompatibilität mit jedem Spiel und Audio-/Grafiktreiber.
