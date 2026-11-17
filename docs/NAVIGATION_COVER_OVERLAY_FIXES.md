# Spielseite, Cover-Hover und FPS-Overlay

Stand: 30.10.2026.

## Rückweg zur Startseite

Die vorherige Korrektur entfernte die alte Spielseite bei Sidebar-Navigation sofort, behielt sie beim normalen Zurückgehen aber noch 180 ms zum Ausblenden. Dadurch konnte die Vorschau weiterhin über der wieder sichtbaren Zielseite erscheinen.

Die äußere Spielansicht verwendet jetzt keine ausgehende Presence-Ebene mehr. Zurück, Back-Label, Escape, Maus-Zurück und Sidebar-Navigation entfernen sie im selben Commit. Beim Öffnen blendet nur die neue Spielansicht ein; ein Wechsel der Spielauswahl erhält eine eigene React-Identität. Späte Namensauflösung prüft weiterhin die aktuelle Auswahl, bevor sie etwas öffnen darf. Der dafür nicht mehr benötigte Navigationszähler und die gespeicherten ausgehenden JSX-Bäume wurden entfernt.

Die darunterliegende Seite bleibt gemountet, ist während der Vorschau aber unsichtbar, transparent und inert. Dadurch scheinen Home-Inhalte nicht durch die matten Spiel-Panels, und verdeckte Schaltflächen erhalten keine Eingaben. Beim Schließen werden dieselben Seitenknoten mit ihrem Scrollstand wieder sichtbar. Ein Home-Klick bei bereits hinterlegtem Home erzeugt keinen doppelten Verlaufseintrag.

## Cover

Die Karten verwenden Paint-Containment, um große Listen günstig darzustellen. Bisher wurde das innere Cover beim Hover um drei Pixel über die Kartengrenze geschoben; die obere Rundung wurde abgeschnitten. Jetzt bewegt sich die ganze Karte samt Zeichenbereich. Das Containment und der vorhandene Platz im Karussell bleiben erhalten. Der Bild-Zoom der Bibliothekscover entfällt, damit Cover-Schrift beim Hover vollständig bleibt.

## Widget und gezielte FPS-Freigabe

Das matte Performance-Widget hat feste Spalten, tabellarische Ziffern und einen kompakten FPS-Status. Die lange Berechtigungszeile entfällt. Fehlende Werte bleiben unbekannt; Systemlast wird weiterhin als CPU/GPU/RAM angezeigt, die FPS gehören ausschließlich zur erkannten Spiel-PID. Die Uhr aktualisiert sich an der Minutengrenze.

Unter **Einstellungen → Gameplay Overlay → Performance Overlay** gibt es **FPS-Zugriff aktivieren**. Ein ausdrücklicher Klick fordert die Windows-Bestätigung für `Eclipse FPS Helper` an. Die übrigen Launcher-Funktionen bleiben ohne Administratorrechte. Die Freigabe wird weder automatisch beim Spielstart angefordert noch als Benutzergruppe oder Dienst installiert.

Der kleine C#-Helfer:

- prüft den gepinnten SHA-256 der offiziellen PresentMon-Datei;
- verbindet sich über eine zufällige lokale Pipe und überprüft die PID ihres Servers;
- akzeptiert ausschließlich eine numerische Ziel-PID, Stoppen und Beenden;
- erfasst keine Eingaben und schreibt keine FPS-Dateien;
- beendet ausschließlich seine eigene ETW-Sitzung und seinen eigenen Collector;
- stoppt die Erfassung bei deaktivierter FPS-Anzeige und beendet sich, wenn Eclipse die Verbindung schließt.

Die Freigabe lässt sich während derselben Launcher-Sitzung für weitere Spiele verwenden. Abbruch im Windows-Dialog startet keinen neuen Versuch. Es werden keine Windows-Gruppen geändert. Ein Neustart oder erneutes Anmelden ist für diese Methode nicht erforderlich.

Quellen: [PresentMon-Berechtigungen und Optionen](https://github.com/GameTechDev/PresentMon), [Windows-Pipe-Server-PID](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeserverprocessid).

## Prüfungen und Grenzen

`npm run check` prüft TypeScript, 133 Tests und den Produktionsbuild. Der isolierte Store-Test prüft die vollständige obere Coverkante, das sofortige Entfernen einer gescrollten Spielseite, späte Detaildaten sowie den bestehenden Hero-Wechsel.

Der Electron-Test prüft elf Rückwege aus Vorschauen über Sidebar, Zurück-Pfeil, Back-Label, Escape, Maus-Zurück und einen schnellen Escape/Home-Wechsel. Einstiegspunkte sind Installed Games, Hero und Bibliothekskarte. Der erste Commit ohne Vorschau und die folgenden 350 ms müssen frei von Spielseiten bleiben; ein späteres erneutes Öffnen gilt ebenfalls als Fehler. Außerdem werden Scrollstand, wiederverwendetes Home, verdeckter Hintergrund und inert-Zustand geprüft. Aktuelle Protokolle: `tests/material-navigation-check.log`, `tests/material-navigation-build.log`, `tests/material-navigation-gpu.log`, `tests/material-navigation-software.log`, `tests/material-store-electron.log`.

Alle elf Fälle bestanden mit und ohne GPU. Auch der Store-Test mit verspäteten Detaildaten besteht; es traten keine Rendererfehler auf. Aktuelle Ergebnisübersicht: `.cache/launcher-atmosphere/material-navigation-verification.json`.

Der native Integrationstest verwendet `--collector`, ohne eine Freigabe anzufordern. Er bestätigt die echte C#-/Node-Verbindung, den regulären Shutdown und die Zurückweisung eines falschen Elternprozesses. Windows verweigert diesem nicht erhöhten Test weiterhin die ETW-Erfassung. Der positive UAC-Dialog und echte Live-FPS eines Spiels benötigen eine ausdrückliche Bestätigung durch den Benutzer und wurden nicht automatisch ausgelöst.

Protokolle: `tests/navigation-overlay-check.log`, `tests/navigation-store-electron.log`, `tests/navigation-overlay-electron.log`, `tests/fps-broker-native-unrestricted.log`. Ergebnisübersicht: `.cache/overlay-audit/navigation-cover-verification.json`. Widget-Bilder verwenden Testwerte.

## Helfer neu kompilieren

Die vorhandene Paketkonfiguration nimmt die EXE unter `electron/native/PresentMon` auf und entpackt sie außerhalb des ASAR-Archivs. Der Quelltext wird nicht ausgeliefert.

```powershell
$nativeRoot = Join-Path (Get-Location) 'electron\native\PresentMon'
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /platform:x64 /target:winexe ("/out:" + (Join-Path $nativeRoot 'FpsBroker.exe')) (Join-Path $nativeRoot 'FpsBroker.cs')
```
