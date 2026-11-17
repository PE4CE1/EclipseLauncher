# Profile für Eclipse 2.0

Die Profilansicht verwendet einen zusammenhängenden Profilkopf mit Banner, Avatar, Status und einer gemeinsamen Statistikleiste. Weniger farbige Badges, warme Akzente und dunklere Flächen halten eigene und fremde Profile auch vor hellen Steam-Hintergründen lesbar. Vorhandene Banner, Rahmen, Biografien, Socials, Steam-Daten und Hardware bleiben verwendbar.

## Funktionen

- **Übersicht:** Lieblingsspiele mit echten Covern, in Eclipse erfasste Spielzeiten, zuletzt gespielte Titel und eine Seitenleiste für Beschreibung, Steam und optional Hardware.
- **Spiele:** Suche, Sortierung nach Name/Spielzeit/letztem Spielen und schrittweises Nachladen in Gruppen von 36. Bei fremden Profilen lassen sich gemeinsam vorhandene Steam-Spiele filtern. Verglichen werden App-IDs.
- **Anheften:** Über „Lieblingsspiele → Auswählen“ bis zu drei Spiele festlegen; Auswahl erneut anklicken, um sie zu entfernen. Die Auswahl wird lokal gespeichert und beim vorhandenen Profilabgleich veröffentlicht. Ohne Auswahl erscheinen die meistgespielten Titel, sofern Spielzeiten sichtbar sind.
- **Abzeichen:** Eigener Bereich für vorhandene Steam-Abzeichen. Versteckte Steam-Statistiken werden berücksichtigt.
- **Bearbeiten:** Separater Dialog für Name, Avatar, Banner, Hintergrund, Rahmen, Bio, Socials, Steam und Hardware. Schließen mit Escape, Fokus bleibt im Dialog und kehrt anschließend zum Auslöser zurück. Schreibfehler lassen den Entwurf offen, statt Erfolg vorzutäuschen.

## Korrekturen

- Bibliothek und Scanner verwenden dieselbe Zusammenführung wie der veröffentlichte Profilstand. Gleiche Steam-IDs werden einmal gezählt, Spielzeiten zusammengeführter Einträge werden nicht addiert. Installationszahlen stammen aus erkannten Installationen, nicht aus alten Bibliotheksmarkierungen.
- Bei schnellem Profilwechsel können verspätete Antworten nicht das gerade gewählte Profil überschreiben. Fehlende/offline nicht abrufbare Profile zeigen einen Fehlerzustand mit erneuter Abfrage.
- Ausgeblendete Spielzeiten werden aus Gesamtzeit, Rangliste, angehefteten Spielen und Steam-Spielzeitfeldern des nächsten Profilabgleichs entfernt. Versteckte Steam-Daten und Hardware werden ebenfalls entsprechend ausgelassen. Bereits veröffentlichte Daten ändern sich beim nächsten erfolgreichen Abgleich; dieser Test schreibt nicht in echte Cloud-Profile.
- Fehlgeschlagene Freundschaftsanfragen erzeugen keine lokalen Schein-Freundschaften mehr.
- Profilvideos pausieren bei Fokusverlust, verborgenem Dokument und aktivierter Einstellung für reduzierte Bewegung. Der Standardbanner benötigt keine Videos oder zusätzlichen Netzwerkzugriffe.
- Steam- und Social-Links werden auf die zugehörigen HTTPS-Domains beschränkt. Fehlerhafte Medienlinks fallen auf die lokale Gestaltung zurück.

## Dateien

- `src/components/profile/ProfileView.tsx`: Daten, Profilwechsel, Speicheraktionen und bestehende Anpassungsfelder.
- `ProfileOverview.tsx`, `profile.css`: neue Oberfläche und Spielefunktionen.
- `ProfileDialog.tsx`, `ProfileMedia.tsx`: Dialogbedienung und Medien-Lebenszyklus.
- `src/services/profileModel.ts`: gemeinsame Spielzusammenführung, Statistik, Anheftung und URL-Prüfung.
- `src/services/firebaseService.ts`: Profilabgleich inklusive Auswahl und Privatsphäre.

## Prüfung

- `tests/profile-redesign-unit.log`: 41 erfolgreiche Tests für Profilmodell sowie vorhandene Frontend-/Core-Regressionen.
- `tests/profile-redesign-build.log`: TypeScript und Produktionsbuild.
- `tests/profile-redesign-fixture.log`: isolierte Profil-Testoberfläche.
- `tests/profile-redesign-native.log` und `.cache/profile/verification.json`: Electron-Prüfung von Suche, Anheftung, Fehlerbehandlung beim Speichern, Dialog/Tastatur, Privatsphäre, Abzeichen, gemeinsamen Spielen, Listenbegrenzung, Profilwechseln, fehlgeschlagenen Anfragen, Übersetzung und Fenstergrößen bis 400 px.
- Screenshots: `.cache/profile/profile-overview.png`, `profile-editor.png`, `profile-mobile.png`.

Die UI-Prüfung verwendet Testprofile und isolierte Einstellungen. Es wurden keine echten Freundschaftsanfragen gesendet, keine Cloud-Profile verändert und kein Installer erstellt.

## Steam-Rahmen, Banner und Spielstatus

- **Profil bearbeiten → Avatar-Rahmen → Von Steam aktualisieren → Mein Steam-Rahmen → Speichern** verwendet den aktuell auf Steam ausgerüsteten Rahmen. Das vorhandene öffentliche Profil-HTML liefert die Grafik und, wenn vorhanden, die statische Variante. Es wird kein Steam-Passwort oder API-Schlüssel benötigt. Bei Fokusverlust und reduzierter Bewegung wird die statische Grafik bevorzugt. Ein nicht ausgerüsteter Rahmen entfernt alte Grafiken; ein nicht erreichbares Profil löscht den bekannten Rahmen nicht.
- Der Rahmen liegt mit Steams Skalierung von 1,22 über dem quadratischen Profilbild. Auswahl und Grafik werden im bestehenden Profilabgleich auch für Freunde übernommen. Rahmen aus Kommentar-Avataren werden nicht mit dem eigenen Rahmen verwechselt.
- **Banner ändern** bietet sechs lokal gezeichnete Motive ohne zusätzliche Downloads, Artwork aus der eigenen Spielesammlung und eigene Bild-/Videolinks. Vorschau, Suchfeld und vertikaler Bildausschnitt sind integriert. Änderungen werden erst beim Speichern übernommen. Große Steam-Hero-Bilder werden vor kleinen Shop-Headern bevorzugt.
- Ein laufendes Spiel erscheint unter dem Namen mit grünem Status und zusätzlich als „Spielt gerade“-Karte mit Artwork und Link zur Spielansicht, sofern die App-ID bekannt ist. Beim eigenen Profil wird die tatsächliche Startzeit angezeigt; bei Freunden wird keine Startzeit erfunden. Spielende, Spielwechsel und Offline-Status entfernen veraltete Spielanzeigen.
- Einen doppelten Filter für gemeinsame Spiele entfernt und verhindert, dass bei einem fehlgeschlagenen Steam-XML-Abruf die Rahmen-Grafik als eigentliches Profilbild eingelesen wird.

Quelle zu Steam-Profilgrafiken: [Steamworks – Community Profile Items](https://partner.steamgames.com/doc/api/ISteamFriends?l=english#ECommunityProfileItemType). Grafik und statische Variante wurden zusätzlich am öffentlichen Steam-Profil-HTML überprüft; die Größenangabe stammt aus Steams `profilev2.css`.

Zusätzliche Prüfung: `tests/profile-appearance-unit.log` (47 Tests), `tests/profile-appearance-build.log`, `tests/profile-appearance-native.log` und `.cache/profile/appearance-verification.json`. Die Electron-Prüfung deckt Auswahl/Speicherung, Spiel-Artwork, Rahmen-Parsing, Fokusverlust, reduzierte Bewegung, Ausrüsten/Ablegen, temporär nicht erreichbares Steam-Profil und Spielstatuswechsel ab. Testprofile und Spielstatus sind simuliert; es wurde kein echtes Spiel gestartet.

Vorschauen: `.cache/profile/appearance-banner-picker.png`, `.cache/profile/appearance-frame-picker.png`, `.cache/profile/appearance-playing.png`.

### Steam-Rahmen als Standard und in der Seitenleiste

- Für neue Profile und alte Profile mit der früheren ungewählten „none“-Vorgabe ist Steam jetzt die Standardauswahl. Bereits gewählte farbige Rahmen bleiben erhalten. Eine ab jetzt ausdrücklich gespeicherte Auswahl „Kein Rahmen“ bleibt auch nach erneutem Öffnen deaktiviert.
- Die gemeinsame Avatar-Komponente wird auch oben links und im geöffneten Profilmenü verwendet. Die Größe bleibt bei 40 × 40 px; die darüberliegende Steam-Grafik beeinflusst die Position des Namens und des Menüs nicht. Das kleine Avatar-Stylesheet wird direkt mit der Seitenleiste geladen, unabhängig vom Öffnen der Profilseite.
- Bei verknüpftem Steam-Profil und noch fehlenden Rahmendaten lädt die Seitenleiste einmal verzögert das öffentliche Profil-HTML. Ein bereits bekannter Rahmen braucht diesen zusätzlichen Abruf nicht. Fehler verändern das vorhandene Profilbild nicht.
- Hauptdateien: `src/services/steamProfileAppearance.ts`, `src/hooks/useSteamAvatarFrame.ts`, `src/components/profile/ProfileAvatar.tsx`, `profile-avatar.css`, `src/components/layout/Sidebar.tsx` und die Auswahl/Speicherung in `ProfileView.tsx`.
- Prüfung: `tests/steam-frame-default-unit.log` (45 Tests), `tests/steam-frame-default-build.log`, `tests/steam-frame-default-native.log`, `.cache/profile/steam-default-verification.json`. Die Electron-Prüfung prüft zusätzlich den einzelnen Hintergrundabruf, beide Menü-Zustände ohne Positionssprung oder abgeschnittenen Rahmen und die ausdrücklich gespeicherte Auswahl „Kein Rahmen“.
- Vorschauen mit Testprofil: `.cache/profile/steam-frame-sidebar.png`, `.cache/profile/steam-frame-sidebar-menu.png`.
