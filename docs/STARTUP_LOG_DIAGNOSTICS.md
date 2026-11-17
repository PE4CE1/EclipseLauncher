# Startprotokoll: Electron, Cover und Clips

Stand: 31.10.2026. Ausgangspunkt ist das vom Nutzer bereitgestellte Entwicklungsprotokoll mit `console-message`-Deprecation, DevTools-Diagnosen, Steam-CORS-Meldungen und fehlgeschlagener Replay-Aufnahme.

## Einordnung und Änderungen

- Der globale Konsolenlistener nutzte die veralteten positionalen Argumente von Electron und bezeichnete Warnungen ebenfalls als `RENDERER ERROR`. `electron/rendererLogging.ts` liest das aktuelle Ereignisobjekt und trennt Warnungen und Fehler. Nur registrierte, vertrauenswürdige App-WebContents werden weitergeleitet. Die eigene DevTools-Konsole wird nicht als Launcher-Renderer protokolliert; tatsächliche App-Fehler bleiben sichtbar.
- `Autofill.enable`, `Autofill.setAddresses` und `No handler registered for issue code PerformanceIssue` sind DevTools-Diagnosen zu internen Protokollfunktionen. Sie sind von Fehlern in App-Seiten zu unterscheiden.
- `Reduced Motion` ist ein Hinweis der Animationsbibliothek auf die Systempräferenz. Die Einstellung bleibt respektiert; sie wird nicht automatisch deaktiviert.
- Steam-Bilder wurden im Renderer per CORS-`fetch()` geprüft. Auch fehlende Bilddateien können Antworten ohne CORS-Header liefern und dadurch diese Meldungen erzeugen. `electron/artworkPrefetch.ts` prüft öffentliche Steam-Bilder über Electrons Chromium-Netzwerkstack und lädt die codierten Bytes, ohne beim Start alle Bitmaps zu decodieren. Die bestehende Bild-Fallback-Kette bleibt erhalten. Eigene Bildhosts verwenden gewöhnliche Bildanfragen. Die neue IPC-Route teilt Anfragelimit, Abbruch und Fensterbereinigung mit der Netzwerkbrücke. Erlaubt sind ausschließlich HTTPS-Bilder bekannter Steam-Hosts; keine Anmeldedaten, keine HTTP-Weiterleitungen, maximal 4 MiB und sechs Sekunden pro Bild. `webSecurity` bleibt aktiv.
- Die Replay-Aufnahme verwendet nun `getDisplayMedia` mit `setDisplayMediaRequestHandler`. Eine per IPC vorbereitete Auswahl ist an das vertrauenswürdige Hauptdokument gebunden, acht Sekunden gültig und einmal verwendbar. Navigation oder eine neuere Auswahl verwirft alte Freigaben. Ein verschwundenes ausgewähltes Fenster wird nicht durch eine Aufnahme des gesamten Desktops ersetzt. Ein leerer beziehungsweise veralteter Monitorwert kann den ersten verfügbaren Monitor auswählen. Ein Audiofehler darf einen gezielten Versuch ohne Loopback-Ton auslösen; eine Berechtigungsverweigerung startet keine Wiederholungsschleife.
- Aufnahmefehler enthalten jetzt Namen und Meldung der Exception. Nach fehlgeschlagenem Start oder Wiederanlauf bleibt der Replay-Status nicht fälschlich aktiv.

`Loading Vite Dev Server`, die erfolgreiche CS2-GSI-Installation und `Discord RPC ready` sind normale Startmeldungen.

## Prüfung

`npm run check`: Typecheck, 153 bestandene Unit-Tests und Produktionsbuild. Neue Tests prüfen native Bildantworten ohne CORS, Fehlerstatus, Größenlimit, Abbruch, Protokoll-Schweregrade, einmalige Aufnahmefreigaben, Navigation während der Quellenauswahl, Audio-Fallback, Berechtigungsverweigerung und fehlgeschlagene Replay-Wiederherstellung.

Die native Electron-Prüfung erfasst ausschließlich das isolierte Launcher-Testfenster, ohne Ton. `getDisplayMedia` startet ohne vorherigen Mausklick, liefert einen Video-Track und wird mit MediaRecorder zu echten WebM-Daten codiert. Die Testdaten bleiben im Arbeitsspeicher und werden verworfen. Eine zweite unvorbereitete Aufnahmeanfrage wird abgelehnt. Eine kontrollierte Bildantwort ohne CORS-Header wird angenommen; eine fehlende Datei wird ohne Renderer-CORS-Fehler übersprungen. Für das Videoframe-Experiment wird das Testfenster sichtbar gezeichnet; eine verdeckte Oberfläche kann sonst im Test keine Frames liefern.

Die vollständige GPU-Electron-Prüfung ist mit 590 Scan-Testspielen plus den beiden Demo-Cover-Szenarien bestanden: kein erfasster Rendererfehler, keine erzwungenen Bitmap-Decodes beim Start, native Aufnahme mit echten WebM-Daten, Navigation und Materialprüfungen erfolgreich. Die isolierte Store-Prüfung für Vorschauwechsel, Hover und Installations-Badges ist ebenfalls bestanden.

Protokolle: `tests/startup-diagnostics-check.log`, `tests/startup-diagnostics-unit.log`, `tests/startup-diagnostics-electron.log`, `tests/startup-diagnostics-store.log`. Ergebnisse: `.cache/startup-diagnostics/verification.json` und `.cache/startup-diagnostics/electron-verification.json`.

Der Test prüft den Aufnahmeweg und Encoder mit dem Testfenster. Er bestätigt keine Aufnahme sämtlicher Spiele, geschützter Inhalte oder aller Audio-/Grafiktreiber. Falls Windows eine konkrete Quelle weiterhin blockiert, bleibt der Fehler sichtbar und enthält jetzt seinen eigentlichen Grund. Electron und Preload müssen vollständig neu gestartet werden, damit die Änderungen im laufenden Entwicklungsprozess greifen.
