# Scroll-Darstellung und Profilglas

Stand: 31.10.2026.

## Änderungen

Die Popup-Grenze wurde vorher auf mindestens 4 px geklemmt. Bei diesem Sidebar-Anker brauchte die äußere Fläche 3 px Abstand, damit ihr Profilinhalt exakt mit dem geschlossenen Kopf übereinstimmt. Das verursachte einen messbaren Sprung um einen Pixel. Die Positionierung verwendet jetzt die tatsächlichen Rahmen- und Padding-Maße; der Vergleich zeigt bei DPR 1, 1,25 und 1,5 jeweils 0 px Differenz in Position und Textbreite. Tönung von 84 % auf 58 % reduziert, Blur unverändert 28 px; eine schwache Reflexion und die gemeinsame Kontur erhalten die Zuordnung zum Profil. Außerhalb des Fokus bleibt der Blur deaktiviert und die Fläche stärker getönt.

Bibliothekskarten erzwingen keine eigenen GPU-Ebenen mehr durch `translateZ(0)` und `will-change: transform`. Die Karten und ihre Beschriftungen behalten ihre echten Flussmaße. Nur das Artwork mit festem Seitenverhältnis beziehungsweise fester Icongröße verwendet `content-visibility: auto`. Damit müssen unsichtbare Rasterkarten und Listenzeilen keine geschätzten Höhen mehr annehmen. Übertriebene permanente Ebenen wurden auch aus Home- und Katalog-Covern entfernt. Blur in unsichtbaren Bibliotheksaktionen wird erst beim Hover benötigt; das vollständig deckende Rabatt-Badge benötigt keinen Blur.

Sidebar und Bibliothek abonnieren nur benötigte Store-Felder. Das vermeidet Renderdurchläufe durch unabhängige Store-Änderungen. Die Home-Vorschau pausiert Rotation und Vorbereitung des nächsten Bildes außerhalb des sichtbaren Scrollbereichs. Zwei alte CSS-Ausnahmen, die Cover-Ladeanimationen auch außerhalb des Fokus erzwangen, sind entfernt.

## Vergleichsmessung

Isolierte Electron-App mit GPU, 1400 × 900 CSS-Pixeln, 590 Testspielen, lokal gecachten Testcovern und drei nativen Scrollgesten über je 4500 px. Das Testfenster wird für die Messung sichtbar; Hintergrund-/Verdeckungsdrosselung ist für diesen Test deaktiviert. Während der Zeitmessung werden keine Screenshots erstellt. Der erste Lauf umfasst zusätzliche Rendering-Arbeit; zum Vergleich werden auch die beiden Wiederholungen getrennt angegeben.

| Messgröße | Vorher | Nachher |
| --- | ---: | ---: |
| Hauptthread-Arbeit, erster Scrolllauf | 1971 ms | 1657 ms |
| Hauptthread-Arbeit, Mittel der zwei Wiederholungen | 1751 ms | 927 ms |
| Kompositor-Ebenen nach den Wiederholungen | 442 | 10 |
| Dauerhaft erzwungene Karten-Ebenen | 590 | 0 |
| Raster-Scrollhöhe vor/nach Scrollen | 31696 / 31793 px | 32386 / 32386 px |
| Listen-Scrollhöhe vor/nach Scrollen, Nachprüfung | – | 53269 / 53269 px |

Das entspricht ungefähr 47 % weniger Hauptthread-Arbeit in den wiederholten Scrollläufen dieses Szenarios. Es ist keine Aussage über die gesamte CPU-Auslastung oder garantierte FPS auf anderen Rechnern. Die Frame-Abstände schwanken; der warme Median blieb bei rund 10,7 ms. Der p95 betrug vorher 21,4 / 17,9 ms und nachher 17,9 / 17,8 ms.

Nachweise: `.cache/scroll-before/verification.json`, `.cache/scroll-after/verification.json` und `.cache/scroll-after/scroll-trace.json`. Der Trace enthält einen zusätzlichen Listen-Scroll nach der Vergleichsmessung. Im ersten sichtbaren Baseline-Lauf schlug nach Abschluss der Messung eine spätere Bildschirmaufnahme in der bereits versteckten Test-App mit `UnknownVizError` fehl; die Messdaten waren zu diesem Zeitpunkt gespeichert. Der Test lässt das Fenster inzwischen bis zur regulären Zerstörung bestehen.

Typecheck, 145 Unit-Tests und Produktionsbuild bestanden: `tests/scroll-polish-check.log`. Auch die Scroll-Prüfung, die vollständige GPU-Oberflächenprüfung und die isolierten Store-Regressionen sind bestanden: `tests/scroll-after-electron.log`, `tests/scroll-polish-electron.log` und `tests/scroll-store-electron.log`. Die Blur-Pixelprüfung misst 10 Kontraststufen mit Blur gegenüber 108 ohne Blur; der Effekt wird tatsächlich gerendert. Elf Vorschau-Rückwege, Hover-Darstellung und reduzierte Bewegung bleiben geprüft.
