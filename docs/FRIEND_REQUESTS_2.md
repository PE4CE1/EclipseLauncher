# Freundschaftsanfragen und öffentliche Profile

## Oberfläche

- Über **Profilmenü → Freunde → Hinzufügen** kann ein Freundescode gesucht werden. „View Profile“ wartet auf die wiederhergestellte Anmeldung. Codes mit kleingeschriebenem Präfix, führendem `#`, Leerzeichen oder unsichtbaren Kopierzeichen werden normalisiert. Die aufgelöste UID stammt aus der Dokument-ID, nicht aus einem frei übernommenen Datenfeld.
- „Hinzufügen“ sendet eine Anfrage. Es entsteht noch kein Eintrag in einer Freundesliste.
- Empfänger sehen eine Benachrichtigung unten rechts für sechs Sekunden, sofern ihre Benachrichtigungen aktiviert sind. Das Symbol am Profil und der Zähler bei „Freunde“ bleiben bis zur Bearbeitung der Anfrage erhalten.
- Im Freundesfenster gibt es **Freunde** und **Anfragen**. Eingehende Anfragen lassen sich ansehen, annehmen oder ablehnen. Unter „Gesendet“ können eigene Anfragen zurückgezogen werden.
- Eine Gegenanfrage führt zur bestehenden eingehenden Anfrage; sie nimmt sie nicht automatisch an. Doppelte Klicks erstellen keine zweite Einladung.
- Nach Entfernen eines Eclipse-Kontakts bietet die kurze Rückmeldung „Anfrage senden“ an. Ein entferntes Konto wird nicht ohne erneute Zustimmung wieder gegenseitig hinzugefügt. Lokale Steam-Kontakte bleiben davon getrennt.

## Speicherung und Zustimmung

`friend_requests/{fromUid}__{toUid}` enthält Teilnehmer, öffentliche Anzeigenamen, öffentliche Avatar-/Freundescode-Angaben, Status sowie Serverzeitstempel. Zugangsdaten und Recovery Keys gehören nicht in diese Sammlung. Nur die beiden Teilnehmer können eine vorhandene Anfrage lesen.

Der Empfänger nimmt eine ausstehende Anfrage in einer Firestore-Transaktion an: Beide Freundeslisten und der Status werden gemeinsam geändert. Ein fehlgeschlagener Schreibvorgang erzeugt keine einseitige Freundschaft. Ablehnen und Zurückziehen ändern keine Freundesliste. Die Regeln verbieten sowohl fremde als auch eigene ungefragte Freundschaftseinträge und prüfen die Anzeigenamen gegen die jeweiligen öffentlichen Profile.

Eingehende und ausgehende ausstehende Anfragen werden über je einen Echtzeit-Listener verfolgt. Die Liste wird nach Serverzeit sortiert; erneute Snapshots erzeugen keine doppelten Benachrichtigungen. Nach Ablehnen ist erneutes Senden für 24 Stunden, nach Zurückziehen für eine Minute gesperrt. Bestehende Freundschaften werden beim Update nicht verändert.

Das separate Freundesfenster liest dieselbe authentifizierte Sitzung, ohne das Hauptprofil oder den aktuellen Spielstatus erneut zu veröffentlichen. Es zeigt keine doppelte Toast-Meldung und überschreibt keine Launcher-Einstellungen mit seinem älteren lokalen Zustand. Lokale veraltete Kontakte werden nicht mehr automatisch in eine bereits geänderte Cloud-Freundesliste zurückgeschrieben.

Freundescodes bleiben ausschließlich öffentliche Suchkennungen. Anmeldung und Kontowiederherstellung verwenden weiterhin die geschützte Sitzung beziehungsweise den Recovery Key.

## Prüfung und Freigabe

- 509 automatisierte Tests sowie Typprüfung und Produktionsbuild erfolgreich.
- 15 Tests im lokalen Firebase-Emulator prüfen unter anderem öffentliche Profilabfrage, Kontowiederherstellung, Anfragen zwischen zwei künstlichen Konten, Echtzeitlisten, Benachrichtigungen, Annahme, Ablehnen, Zurückziehen, Fehler und unerlaubte Zugriffe.
- Der Electron-Test prüft Profilaufruf, Anfragen, Zähler am Profil und eine automatisch verschwindende Toast-Meldung. Der Profilhinweis bleibt nach der Meldung bestehen und verschwindet nach Bearbeitung.
- Die Regeln wurden am 8. November 2026 im vorhandenen Projekt `eclipse-launcher-d4cd3` aktiviert. Der aktive Stand wurde anschließend bytegleich normalisiert geprüft; beide Anfrage-Abfragen wurden lesend gegen eine nicht existierende Prüfkennung ausgeführt. Es wurden keine Einladungen an echte Personen zum Testen gesendet.

Lokale Nachweise liegen unter `.cache/friend-requests-*` und `.cache/friends-refine/`. Vorherige Regeln: `.cache/friend-requests-rules-before.json`; veröffentlichter Stand: `.cache/friend-requests-production-verification.json`.

Für den vollständigen Ablauf müssen beide Teilnehmer den aktualisierten Launcher verwenden.

## Integriertes Hinzufügen und Aktualisieren

„Hinzufügen“ ist jetzt eine eigene Ansicht innerhalb des unverändert 340 × 540 Pixel großen Freundesfensters. Die Liste wird beim Zurückkehren wieder angezeigt; Profilaufrufe aus dem separaten Fenster werden im Hauptfenster geöffnet. In dieser Ansicht wird kein vollständiges Profil erneut veröffentlicht.

Freundescodes im Profil verwenden die native Clipboard-Funktion mit Browser-Fallback. Ein animiertes Häkchen und eine übersetzte Bestätigung zeigen den Erfolg; die Bestätigung verschiebt den Profilinhalt nicht. Der Fokusrahmen liegt innerhalb der vorhandenen Eingaberänder.

Neuladen liest die aktuelle Cloud-Mitgliedschaft und lädt alle Profile in parallelen Gruppen von bis zu 30 Konten. Gleichzeitige Aufrufe teilen sich eine Anfrage, automatische Folgeaufrufe verwenden für 1,5 Sekunden das Ergebnis. Ein manueller Reload umgeht diesen kurzen Cache und verbindet die Anfrage-Listener neu. Fehler werden weitergereicht, während die letzte verwendbare Liste erhalten bleibt.

Zusätzlich geprüft: zwei Tests für Bündelung, mehr als 30 Freunde und Fehlererhalt; isolierter Electron-Test für integriertes Hinzufügen, Profilaufruf, beide Kopierfunktionen, Fokusrahmen, Neuladen und Fehlerbehebung. Insgesamt 511 reguläre Tests erfolgreich.
