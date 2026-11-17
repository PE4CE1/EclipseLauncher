# Freunde-Fenster in Eclipse 2.0

## Oberfläche

- Das separate Fenster behält seine Größe von **340 × 540**. Vergrößern, Maximieren und Vollbild sind deaktiviert; die Titelleiste bleibt zum Verschieben nutzbar.
- Profil, Suche und Hinzufügen bleiben stehen. Nur die Freundesliste scrollt.
- Online, im Spiel und offline sind über Statuspunkte und Text erkennbar. Gruppen können eingeklappt werden.
- Vorhandene Freunde bleiben während der Aktualisierung sichtbar. Ein Verbindungsfehler ersetzt die Liste nicht durch einen Ladebildschirm.
- Freundesanfragen sowie Entfernen und Rückgängig sind weiterhin verfügbar. Die Texte unterstützen Deutsch und Englisch.

## Hinzufügen ohne Aufblitzen

`FriendsWindow.tsx` und `AddFriendModal.tsx` haben getrennte Suspense-Grenzen in `App.tsx`. Das erstmalige Laden des Add-Dialogs blendet dadurch keine bereits sichtbaren Fenster aus.

Beim Öffnen aus dem separaten Freunde-Fenster bereitet das Hauptfenster zuerst den Dialog vor. Nach zwei Renderframes bestätigt der Renderer die Bereitschaft. Erst danach stellt der Hauptprozess das Fenster wieder her und fokussiert es. Wiederholtes Klicken verwendet den vorhandenen Dialog. Wird er vorher geschlossen, entfällt der ausstehende Fokuswechsel.

Der Dialog verwendet einen gleichmäßig dunklen Hintergrund und verzichtet auf animierten Backdrop-Blur und Skalierung. Ein begrenzter Fallback verhindert, dass ein ausbleibendes Renderer-Signal den Wechsel dauerhaft blockiert. Temporär deaktivierte Hintergrunddrosselung wird anschließend wieder eingeschaltet.

Kopieren verwendet die native Zwischenablage. Mehrfaches Absenden ist gesperrt; verspätete Antworten eines bereits geschlossenen Dialogs öffnen keine Profile und verändern dessen Zustand nicht mehr.

## Dateien

- `electron/friendsWindowPolicy.ts`: feste native Fenstergröße und koordinierter Fokuswechsel.
- `electron/main.ts`, `electron/preload.ts`, `src/types/game.ts`: Fenstererstellung und Dialog-IPC.
- `src/components/friends/FriendsWindow.tsx`: Freundesliste und Aktionen.
- `src/components/friends/AddFriendModal.tsx`: Hinzufügen und Profilsuche.
- `src/components/friends/friends.css`: lokal begrenzte Gestaltung.

Die vorhandenen Social-Dienste und Kontoberechtigungen werden weiterverwendet.

## Prüfung

```powershell
npm run check
npx vite build --config tests/friends-fixture.vite.mts
$env:ECLIPSE_FRIENDS_UI = '1'
npm run test:electron
Remove-Item Env:ECLIPSE_FRIENDS_UI
```

Der Electron-Test verwendet zwei isolierte Fenster und simulierte Social-Daten. Er prüft native Größenregeln und Verschieben, Suche, Gruppen, Anfragen, Entfernen/Rückgängig, Profilauswahl, kaltes und wiederholtes Öffnen des Dialogs, Fokusreihenfolge, Zwischenablage, Fehler, doppelte Übermittlung, Deutsch/Englisch und ein kleines Hauptfenster. Es werden keine echten Freundesanfragen gesendet. Screenshots und Prüfergebnis liegen unter `.cache/friends-refine/`.

Nach Änderungen an nativen Fensteroptionen oder Preload muss Eclipse vollständig neu gestartet werden.
