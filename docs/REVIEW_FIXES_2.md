# Korrekturen nach dem Profil- und Clip-Audit

Stand: 04.11.2026. Die lokalen Änderungen sind implementiert und getestet. Die Firebase-Absicherung wurde mit dem angemeldeten Projekt-Administrator produktiv angewendet und anschließend live geprüft.

## Behobene Clientfehler

1. **Kontowiederherstellung:** Neue Recovery-Schlüssel werden über Firebase Auth an die tatsächlich angemeldete UID gebunden. Sie werden nicht mehr in öffentlichen Profildokumenten oder Hardware-Ankern abgelegt. Alte Schlüssel werden nicht mehr zur Anmeldung akzeptiert. Öffentliche Profilantworten verwenden eine Feld-Allowlist. Fehlgeschlagene Wiederherstellungen setzen die vorherige Anmeldung und lokale Kontodaten zurück.
2. **Steam-Privatsphäre:** Auch die verzögerte Steam-Anreicherung berücksichtigt die aktuellen Einstellungen für Statistiken und Spielzeit. Während des Abrufs geänderte Namen und Privatsphäre-Einstellungen bleiben erhalten.
3. **Folgeclips:** Bis zu drei Aufträge können gesichert werden. Capture-Snapshots, Mikrofonspuren und Anwendungs-Audio werden festgehalten; die native Verarbeitung läuft nacheinander. Pufferdaten haben eine feste Speichergrenze. Die Replay-Historie bleibt auch nach schnellen Segmentwechseln erhalten. Leere Anfangssegmente verwenden die letzten tatsächlich vorhandenen Frames. Weitere Aufträge erhalten eine sichtbare Meldung. Abschlüsse anderer Clips ersetzen keinen bereits geöffneten Editor.
4. **Spielanzahl:** Sidebar und Profil verwenden dasselbe Modell mit Steam-IDs und normalisierten Namen zur Deduplizierung.
5. **Overlay-Einstellungen:** Schreibvorgänge werden geordnet. Ein Fehler nimmt nur die noch aktuelle Änderung zurück und zeigt eine Fehlermeldung. Der native Einstellungscache wird erst nach erfolgreichem Schreiben aktualisiert.

## Verifikation

- 302 Projekttests bestanden, einschließlich REST-Migration, Recovery-Key-Prüfung, Sprachwechsel und Windows-gebundener, authentifizierter Backup-Verschlüsselung.
- 8 lokale Firebase-Emulatortests bestanden: Zugriffsregeln, Eigentümerbindung, sichere Wiederherstellung, Freunde, Administrator-Migration einschließlich privater Feldnamen mit Punkten, atomare Änderungen mit Versionsvorbedingungen und sichere Migration eines bestehenden Auth-Kontos.
- Produktions-Build und Typecheck erfolgreich.
- Echter Electron-/FFmpeg-Test: drei unmittelbare und drei zeitversetzte Clips, vollständiger Replay-Zeitraum, getrennte Audiodateien, sechs Bestätigungen und kontrollierte Überlastgrenze.
- Vollständiger Clip-Editor-Test mit Audio, Seeking, Trim, Export und Recorder-Neustart erfolgreich.
- Nativer Overlay-Einstellungstest einschließlich fehlgeschlagenem Speichern und Rücknahme, Schaltern, Sichtbarkeit, Spielmodus, Rocket-League-Auswahl und responsivem Layout erfolgreich.

Die lokalen Tests verwenden isolierte Daten. Die produktive Live-Prüfung verwendete zwei kurzzeitig angelegte Konten und deren Profile; beide Konten und sämtliche Testdaten wurden wieder entfernt. Benutzerclips wurden nicht verändert; es wurde keine neue Launcher-Version veröffentlicht.

## Produktiver Serverabschluss

- Projekt `eclipse-launcher-d4cd3`: Neue `firestore.rules` veröffentlicht und mit dem lokalen Quelltext verglichen.
- Email/Password für sichere Recovery-Credentials aktiviert; Anonymous für neue Installationen unverändert aktiv.
- 9 bestehende Profile auf Schema 2 bereinigt, 15 nichtöffentliche/veraltete Felder entfernt und 5 alte Geräte-Einträge gelöscht. Ein anschließender Probelauf findet keine verbliebenen privaten Felder oder Geräte-Einträge.
- Verschlüsselte, durch Entschlüsselung geprüfte Sicherungen unter `.cache/firebase-security/backups/`. AES-256-GCM schützt die Daten; der Schlüssel ist mit DPAPI an das aktuelle Windows-Benutzerkonto gebunden. Die Dateien sind von Git ausgeschlossen.
- Live geprüft: gleiche UID nach Recovery, gesperrte unangemeldete Lesezugriffe, gesperrte fremde Profiländerungen, gesperrte öffentliche Recovery-/Gerätefelder und funktionierende Freundeverknüpfungen.

Nach dem Neustart des aktualisierten Launchers den neuen Recovery Key in den Profileinstellungen privat sichern. Ältere Launcher-Versionen müssen für die Profilsynchronisierung aktualisiert werden. Die Verschlüsselung des Migrationsbackups ersetzt keinen persönlichen Recovery-Key-Backup. Der Ablauf steht in [ACCOUNT_SECURITY_2.md](ACCOUNT_SECURITY_2.md).

## Reparatur der alten Kontozuordnung am 04.11.2026

Die lokale Konto-ID war noch vorhanden, die aktive Firebase-Sitzung gehörte jedoch zu einer anderen UID. Ein Recovery Key wurde deshalb zu Recht nicht angezeigt. Über den bereits bestätigten Projekt-Admin wurde der bestehende Auth-Eigentümer geprüft und mit einem neuen, lokal gesicherten Recovery-Credential verknüpft. Die Anmeldung als dieselbe ursprüngliche UID wurde am echten Server verifiziert. Profil und Freundescode blieben erhalten.

Der Client kann beim Start mit einem vorhandenen gültigen Schlüssel die richtige Sitzung wiederherstellen; eine abweichende zurückgegebene UID führt zur Rücknahme der Anmeldung. Freundescodes, rohe UIDs und alte Schlüssel werden vor jedem Auth-Aufruf abgewiesen. Alte lokale Schreibvorgänge können den neuen Schlüssel nicht auf einen unsicheren alten Wert zurücksetzen. Der native Cache erkennt reparierte Dateien ohne wiederholtes vollständiges Einlesen.

Die Account-Karte ist als eigene Komponente umgesetzt. Fehler werden mit stabilen Codes gespeichert und zur Anzeige in die aktuelle Sprache übersetzt, auch wenn zuvor ein deutscher Satz gespeichert wurde. Der isolierte Electron-Test prüft englische Anzeige, unmittelbaren Sprachwechsel, Ablehnung des Freundescodes, Schlüsselanzeige erst nach Einrichtung, Kopieren und erneutes Verbergen nach Wiederherstellung.
