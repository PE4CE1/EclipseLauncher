# Kontosicherheit: Befund und Migrationsplan

**Historischer Befund.** Die lokale Implementierung und der aktuelle Rollout stehen jetzt in [ACCOUNT_SECURITY_2.md](ACCOUNT_SECURITY_2.md). Die Aussagen zum fehlenden lokalen Code unten beziehen sich auf den Prüfstand vom 27.10.2026; der produktive Server-Rollout bleibt gesondert nötig.

Stand: 27.10.2026. Dieses Dokument beschreibt eine noch **nicht implementierte
oder veröffentlichte** Migration für Firebase-Projekt `eclipse-launcher-d4cd3`.

**Kritisch offen:** Im Repository fehlen `firestore.rules`, `firebase.json`,
exportierte produktive Regeln und ein administrativer Migrationsdienst. Für
diese Prüfung bestand kein Firebase-Adminzugriff. Deshalb ist die produktive
Erreichbarkeit der unten beschriebenen Angriffswege nicht bestätigt. Die
Clientarchitektur enthält jedoch keine belastbare serverseitige Kontobindung.
Lokale Fehlerkorrekturen am Launcher beheben diese Grenze nicht.

## 1. Im aktuellen Code nachweisbar

Quellen: [firebaseService.ts](../src/services/firebaseService.ts),
[accountPersistenceService.ts](../electron/accountPersistenceService.ts),
[identityTokens.ts](../src/services/identityTokens.ts).

| Ablauf | Tatsächliches Verhalten | Bedeutung |
| --- | --- | --- |
| Anmeldung | `initFirebaseSocial()` übernimmt die Firebase-Sitzung oder verwendet `signInAnonymously()`. `resolveAndRestoreAccountIdentity()` wählt unabhängig davon eine lokal gespeicherte `canonicalUid`. | Authentifizierte UID und bearbeitete Konto-UID können voneinander abweichen. Ein lokaler Wert beweist kein Kontoeigentum. |
| Profil | `syncMyProfile()` schreibt `accountSecret` und `deviceAnchorId` zusammen mit sichtbaren Profildaten nach `users/{canonicalUid}`. Freunde und Profilsuche lesen vollständige `users`-Dokumente. | Falls die Regeln diese Profilzugriffe zulassen, können Leser auch den Recovery-Schlüssel erhalten. Weglassen des Felds im UI schützt den zugrunde liegenden Dokumentinhalt nicht. |
| Gerätewiederherstellung | `device_identities/{anchor}` enthält erneut UID, Freundescode und Klartextschlüssel. Der Anchor ist ein Hash aus Windows `MachineGuid`, ersatzweise Hostname/Architektur. | Ein vorhersehbarer oder lokal kopierbarer Gerätebezeichner ist kein Anmeldegeheimnis. Er kann sich bei einer Neuinstallation zudem ändern. |
| Recovery | `restoreAccountBySecret()` sucht direkt in `users` bzw. `device_identities` nach `accountSecret`, übernimmt die gefundene UID und schreibt neue Gerätezuordnungen. Die Firebase-Auth-Identität wird dabei nicht gewechselt. | Es fehlt ein serverseitiger Nachweis und ein Auth-Token für das wiederhergestellte Konto; der alte Schlüssel wird nicht verbraucht oder rotiert. |
| Freundschaften | `performBilateralAdd()`, Entfernen und Undo schreiben nacheinander in beide fremden/eigenen `users`-Dokumente. `acceptFriendRequest()` delegiert auf sofortiges Hinzufügen; Ablehnen ist ein No-op. | Eigentümerregeln würden den zweiten Schreibzugriff verweigern. Teilfehler können asymmetrische Listen erzeugen; ein geprüftes Anfrage-/Zustimmungsmodell fehlt. |

Die lokale Sicherung liegt außerdem als JSON unter
`%USERPROFILE%\.eclipse_launcher_identity.json`, in Launcher-Einstellungen und
Base64-kodiert unter `HKCU\Software\EclipseLauncher\Identity`. Base64 ist keine
Verschlüsselung. Diese Kopien erhalten Kontodaten bei App-Resets, ersetzen aber
keine Authentifizierung. Die inzwischen kryptografisch zufällige Generierung
neuer Schlüssel beseitigt eine mögliche frühere Offenlegung nicht.

Firestore gestattet keine selektive Geheimhaltung einzelner Felder eines
lesbaren Dokuments. Öffentliche und private Daten benötigen getrennte
Dokumente. [Firebase: Feldzugriff](https://firebase.google.com/docs/firestore/security/rules-fields)

## 2. Zielarchitektur mit stabilen bestehenden Konten

Die vorhandene kanonische Konto-ID `C`, Freundescodes und Freundesbeziehungen
bleiben erhalten. Nach verifizierter Migration muss die tatsächliche Firebase
Auth UID ebenfalls `C` sein. Der Client darf keine fremde UID durch Settings,
Recovery-Suchergebnisse oder Geräteanker aktivieren.

| Daten/Operation | Ziel und Zugriff |
| --- | --- |
| `public_profiles/{C}` | Ausschließlich freigegebene Profilfelder. Kein Recovery-Schlüssel, Geräteanker oder Auth-Mapping. Sichtbarkeit bewusst definieren. |
| `accounts/{C}` und private Recovery-/Geräte-Dokumente | Serververwaltete Eigentumsbindung, Migrationsstatus und Schlüsselversion. Keine direkten Client-Schreibzugriffe; Recovery-Daten auch nicht direkt lesbar. |
| `friend_codes/{code}` | Server reserviert eindeutigen Code atomar; Lookup liefert nur Konto-ID und freigegebene Profilfelder. |
| Profil/Präsenz | Nur das authentifizierte Konto schreibt erlaubte Felder seines Profils bzw. seiner Präsenz. UID, Eigentümer, Recovery und Freundesstatus sind unveränderbar für den Client. |
| Freunde | Serverendpunkte `request`, `accept`, `decline`, `remove`; Absender immer aus verifiziertem Token. Nur Empfänger darf eine echte offene Anfrage annehmen. Beide Seiten werden atomar geändert. Bestehende Verbindungen werden bei der Migration bewahrt. |

Ein vertrauenswürdiger Backenddienst verifiziert Firebase-ID-Tokens und stellt
nach bestätigter Recovery ein Custom Token für `C` aus. Der Launcher verwendet
anschließend `signInWithCustomToken()` und erst danach die Cloud-Daten von `C`.
Admin-Zugangsdaten gehören ausschließlich auf den Server. Servercode benötigt
eigene Berechtigungsprüfungen, da administrative SDKs nicht durch Clientregeln
abgesichert werden. [ID-Token-Prüfung](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Custom Tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens),
[Regelbedingungen](https://firebase.google.com/docs/firestore/security/rules-conditions)

Neue Recovery-Schlüssel: mindestens 256 zufällige Bits, einmalige Anzeige,
serverseitig nur Hash bzw. servergeschützter HMAC und Version speichern. Recovery
über HTTPS mit Ratenbegrenzung, neutralen Fehlermeldungen und protokollierter
Schlüsselversion; weder Schlüssel noch Tokens protokollieren. Ein erfolgreicher
Vorgang verbraucht den alten Schlüssel atomar und stellt einen neuen aus.
Sitzungswiderruf und erneute Anmeldung der übrigen Geräte müssen ausdrücklich
geregelt werden. [Sitzungen widerrufen](https://firebase.google.com/docs/auth/admin/manage-sessions)

## 3. Reihenfolge für die Umstellung

1. **Produktiven Zustand sichern und prüfen.** Betreiber exportiert Firestore,
   Firebase-Auth-Konten, Regeln und Indizes; Zugriff auf die Sicherung begrenzen.
   Auf einer isolierten Kopie prüfen, welche `users`- und Geräte-Dokumente heute
   für fremde anonyme Nutzer les-/schreibbar sind. Keine Live-Ausnutzung nötig.
   Nachgewiesene aktive Offenlegung erfordert eine sofortige Zugriffssperre für
   betroffene Cloud-Funktionen; lokale Bibliothek und Spielstarts bleiben nutzbar.
2. **Kontenbestand klassifizieren.** Ein wiederholbarer Admin-Dry-run erzeugt
   einen Bericht: kanonische IDs, zugehörige Auth-UIDs, doppelte Freundescodes,
   verwaiste Geräteanker, widersprüchliche Schlüssel und asymmetrische Freunde.
   Bestehende IDs nicht neu generieren, Konflikte nicht automatisch überschreiben.
3. **Eigentum nachweisen.** Eine gültige Sitzung der ursprünglichen Auth UID `C`
   kann serverseitig an Konto `C` gebunden werden. Bei `auth.uid != canonicalUid`
   genügt weder der lokal behauptete Wert noch ein möglicherweise offengelegter
   alter Schlüssel oder Geräteanker. Solche Konten benötigen einen unabhängigen,
   dokumentierten Eigentumsnachweis bzw. betreute Prüfung. Ohne diesen Nachweis
   Konto erhalten und Cloud-Schreibzugriff aussetzen; keine automatische Übernahme.
4. **Backend und neue Datenstruktur aufbauen.** Private Daten aus Profilen
   herauslösen; neue Recovery-Schlüssel erst nach bestätigter Bindung ausgeben.
   Eine serververwaltete Migrationstabelle hält Status, alte/neue Version und
   Konflikte fest. Änderungen transaktional und idempotent ausführen. Alte
   Klartextschlüssel als potenziell kompromittiert behandeln; bloßes Hashen
   nachträglich macht sie nicht wieder geheim.
5. **Neuen Client vorbereiten und pilotieren.** Cloud-Zugriff hinter erfolgreicher
   Auth-Bindung, Recovery ausschließlich über Backend, keine `accountSecret`-
   Queries und keine direkten Geräte-/Fremdprofil-Schreibzugriffe mehr. Lokale
   Identitätsdateien erst nach bestätigter Migration aktualisieren; verschlüsselte
   OS-geschützte Speicherung und getrennten manuellen Recovery-Export vorsehen.
6. **Kontrollierter Cutover.** Geprüften Client verteilen, kleine verifizierte
   Kontogruppe migrieren und Regeln gemeinsam mit dem neuen Backend aktivieren.
   Alte Clients müssen für Cloud-Funktionen gezielt ein Update verlangen; eine
   weiterhin allgemein beschreibbare Legacy-Collection wäre ein Hintereingang.
   Besitzer behalten ihre Konto-ID, Profildaten, Codes und bestätigten Freunde.
   Offline/abwesende Nutzer erhalten später denselben überprüften Recovery-Pfad.
7. **Abschluss und Rückfallstrategie.** Nach positivem Abgleich Klartextfelder in
   `users` und `device_identities` entfernen; Schutz und Aufbewahrung alter
   Sicherungen festlegen. Fehlerhafte Migrationen anhand des Journals reparieren.
   Ein Rollback darf niemals wieder offene Regeln oder alte kompromittierte
   Schlüssel aktivieren; bei Problemen Cloud-Funktionen vorübergehend sperren.

## 4. Freigabekriterien und erforderliche Artefakte

Vor Veröffentlichung gehören versionierte `firestore.rules`, `firebase.json`,
Indizes, Backendquellen, ein Admin-Migrationsskript mit Dry-run/Journal sowie
Emulator-Tests ins Repository. Regeln und Backend müssen mindestens nachweisen:

- Fremde anonyme Sitzung kann weder Konto-ID/Owner ändern noch Recovery-Daten
  lesen, auflisten oder über eine Query finden; Profil-Lookup liefert keine Secrets.
- Manipulierte lokale UID, kopierter Anchor und alter/verbrauchter Recovery-Key
  verleihen keine Rechte. Zwei gleichzeitige Recoveries können denselben
  Schlüssel nicht erfolgreich verbrauchen.
- Profilupdates erlauben nur definierte Felder/Typen; Fremdpräsenz ist gesperrt.
  Freundannahme ohne offene Anfrage sowie Annahme durch den Absender scheitern;
  Wiederholungen und Teilfehler erzeugen keine halben Verbindungen.
- Bestehende Original-Auth-Sitzung, Neuinstallation, Gerätewechsel, verlorene
  lokale Dateien und Konfliktkonten sind getestet. IDs/Codes/Freunde bleiben
  erhalten; ungeprüfte Fälle werden nicht als neues leeres Konto überschrieben.

Regeln mit mehreren simulierten Identitäten und die serverseitigen Transaktionen
getrennt testen. [Firebase-Regeltests](https://firebase.google.com/docs/rules/unit-tests),
[Firestore-Transaktionen](https://firebase.google.com/docs/firestore/manage-data/transactions)

## Warum kein isolierter Sofortpatch ausreicht

Ein Clientpatch kann fremde Clients nicht begrenzen und keine Firebase-Tokens
für ein anderes Konto ausstellen. Nur `request.auth.uid == Dokument-ID` zu
deployen sperrt dagegen bestehende wiederhergestellte Konten mit abweichender
Auth-UID sowie aktuelle beidseitige Freundesupdates aus. `request.auth != null`
allein würde jeden anonym angemeldeten Nutzer zulassen. Deshalb müssen
Eigentumsbindung, Datenmigration, Client und Regeln gemeinsam geprüft werden.
Eine bestätigte Datenoffenlegung darf während dieser Vorbereitung trotzdem
nicht für unbegrenzte Legacy-Kompatibilität offen bleiben.
