# Mikrofone und Noise Gate

In **Clip-Einstellungen → Audio & Mikrofon** zeigt „Mikrofon testen“ den echten Eingangspegel vor dem Gate, die eingestellte Schwelle und den tatsächlichen Öffnungszustand. Ein geschlossenes Gate verbirgt den Ruhepegel nicht. Die Skala reicht von −60 bis 0 dBFS; die Schwelle bleibt wie bisher zwischen −60 und −10 dB einstellbar. −60 deaktiviert das Gate.

Aufnahme und Test verwenden denselben `AudioWorklet`-Prozessor. Die Entscheidung läuft auf dem Audio-Thread, nicht in einem Timer der Oberfläche. Vier Millisekunden Attack, 350 Millisekunden Haltezeit, drei Dezibel Hysterese und eine weiche Release-Kurve reduzieren Flattern und abrupte Schnitte. Der stärkere Mikrofonkanal bestimmt den Pegel; Stereo bleibt erhalten. Nur der aktivierte Test überträgt 20 Pegelwerte pro Sekunde an die Oberfläche. Mikrofonton wird dabei nicht über die Lautsprecher abgespielt.

Die Geräteerkennung fragt zuerst die vorhandenen Eingänge ab. Verbirgt Chromium Namen oder nicht standardmäßige Geräte, fordert Eclipse Mikrofonzugriff an, liest die Liste bei aktivem Zugriff erneut und stoppt die kurze Freigabe-Aufnahme sofort. Bereits vollständig benannte Geräte benötigen keine solche Aufnahme. Systemstandard und konkrete Eingänge werden getrennt angeboten; doppelte Standard-Einträge entfallen. Anschließen, Entfernen und die Rückkehr zum Fenster aktualisieren die Liste. Ein gespeichertes, getrenntes Mikrofon bleibt als nicht verfügbar erkennbar und wird nicht heimlich durch ein anderes ersetzt.

Beim Stoppen des Tests, Wechsel der Einstellungen oder Ausblenden des Dokuments werden Test-Tracks, AudioContext und Worklet freigegeben. Späte Berechtigungsantworten werden nach Verlassen der Ansicht ebenfalls aufgeräumt. Berechtigungs- und Gerätefehler erhalten deutsche beziehungsweise englische Hinweise.

## Prüfung

- `tests/microphone-gate.test.cjs`: echte DSP-Sampleblöcke, Öffnen/Schließen, Haltezeit, Hysterese, Stereo, Bypass, Modul- und Port-Lebensdauer sowie Gerätefreigabe und Abbruch.
- `tests/clip-microphone-smoke.cjs`: isolierter Electron-Test mit synthetischem Mikrofon; Gerätenamen nach Freigabe, Hotplug, Live-Schwelle, sichtbarer Ruhepegel, Fehler, Freigabe und schmale Fenster. Die Worklet-Datei wird dabei auch mit `script-src 'self'` geladen.
- Vorhandener Clip-Studio-Test prüft Aufnahme, getrennte Tonspuren und Exporte mit echtem FFmpeg. Keine echten Bildschirm- oder Mikrofonaufnahmen werden für diese Tests benötigt.

Die Browser-Anforderung an Geräteberechtigungen ist in der [Dokumentation zu enumerateDevices](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices) beschrieben.

## Korrektur der nativen Geräteliste

Der zusätzliche Test mit den echten lokalen Geräten reproduzierte den Fall „Track erkannt, Auswahl leer“: Chromium lieferte für die Berechtigungsprüfung `file:///`, während die native Prüfung nur `file://` beziehungsweise `null` erwartete. Die Mikrofonanforderung war erlaubt, die anschließende Enumeration wurde trotzdem abgelehnt.

`electron/rendererPermissions.ts` behandelt die Datei-Ursprünge jetzt einheitlich. Zugriff bleibt auf vertrauenswürdige Launcher-Fenster und deren Hauptframe beschränkt; fremde Web-Ursprünge bleiben gesperrt. Im lokalen Gerätetest wurden danach unter anderem fifine SC3, HyperX Cloud III Wireless und die virtuellen Mikrofone korrekt aufgelistet. Hierbei wurden nur Gerätenamen gelesen, keine Audiodateien gespeichert oder Audiodaten übertragen. Die native Änderung erfordert einen vollständigen Neustart von Eclipse.
