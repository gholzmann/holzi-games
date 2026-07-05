# LEGO-Stein-Finder — Design

**Datum:** 2026-07-05
**Status:** Entwurf genehmigt (Brainstorming abgeschlossen)

## Ziel

Eine mobile Web-App (HTML/JS, statisch hostbar), die einen bestimmten LEGO-Stein
in einer Kiste voller Steine findet. Der Nutzer fotografiert den gesuchten Stein,
richtet dann die Kamera auf die Kiste und tippt auf „Suchen". Die App markiert
Fundstellen im Standbild. Umschaltbar: nur die Form muss stimmen, oder Form + Farbe.

## Recherche-Ergebnis (Kurzfassung)

- Keine existierende App löst genau dieses Szenario. **Brickit** (iOS/Android) kommt
  am nächsten (markiert Katalog-Teile im Foto eines ausgebreiteten Haufens), ist aber
  geschlossen, ignoriert Farben und hat keine API.
- **Brickognize** (https://api.brickognize.com/docs) identifiziert ein einzelnes Teil
  pro Foto sehr treffsicher: kostenlos, keine Authentifizierung, CORS offen
  (`access-control-allow-origin: *`), Rate-Limit ~60 Anfragen/min. Erkennt nur ein
  Teil pro Bild → wir müssen selbst Kandidaten-Ausschnitte liefern.
- Fertige Browser-ML-Modelle für LEGO existieren nicht; eigenes Training wäre nötig
  (verworfen für v1). Feature-Matching (ORB/SIFT) scheitert an texturarmen Steinen.

## Gewählter Ansatz

**Brickognize + lokale Segmentierung** (Entscheidung des Nutzers):
Kandidaten-Boxen werden lokal im Browser gefunden (Farbmaske/Segmentierung/Kacheln),
die Ausschnitte per Brickognize identifiziert, Treffer im Standbild markiert.
Kein API-Key, keine Kosten, kein ML-Training.

Verworfene Alternativen: eigener YOLO-Detektor im Browser (zu hoher Aufwand für v1,
späterer Upgrade-Pfad), Vision-LLM-API (Kosten, API-Key, ungenaue Lokalisierung).

## Rahmenbedingungen (geklärt mit Nutzer)

- **Suchmodus:** Schnappschuss (kein kontinuierliches Live-Tracking)
- **Szenario:** Kiste/Haufen UND ausgebreitete Steine; im Haufen geringere Trefferquote,
  Workflow „scannen → umrühren → neu scannen"
- **Teile:** alle LEGO-Teile (nicht nur Standardsteine)
- **Deployment:** statische Seite, HTTPS-Hosting (z.B. GitHub Pages), mobile-first
- **Analyse:** Browser + Brickognize-API („was besser funktioniert")

## Bedienablauf & UI

Eine einzelne Web-Seite mit zwei Screens:

### Screen 1 — Stein erfassen

1. Button „Stein fotografieren" öffnet die Kamera (Nahaufnahme, neutraler Hintergrund).
2. Foto geht an Brickognize; die besten 3–5 Vorschläge erscheinen als Karten
   (Bild + Name + Teilenummer). Nutzer tippt den richtigen an.
3. Farbbestimmung: Nutzer tippt im Foto auf den Stein; die App misst die Farbe an
   dieser Stelle (HSV-Mittelwert der Umgebung), damit der Hintergrund nicht mitzählt.
4. Umschalter „Nur Form" / „Form + Farbe".
5. Gesuchtes Teil + Farbmodus werden in `localStorage` gemerkt.

### Screen 2 — Kiste durchsuchen

1. Live-Kameravorschau (Rückkamera) mit großem „🔍 Suchen"-Button; oben klein das
   gesuchte Teil (Bild + Name) als Referenz.
2. Tipp auf „Suchen" friert das Bild ein; Fortschrittsanzeige
   („Analysiere Kandidat x von y…"), Dauer ca. 5–20 s.
3. Treffer werden als grüne Rahmen mit Konfidenz-Prozent markiert; bei „Form + Farbe"
   werden Form-Treffer mit falscher Farbe gelb markiert.
4. Tipp auf einen Rahmen zoomt den Ausschnitt zum Vergleichen.
5. „Weiter suchen" kehrt zur Live-Vorschau zurück.
6. Kein Treffer → Hinweis „Nicht gefunden — Steine umrühren oder näher herangehen".

## Erkennungs-Pipeline

Analyse eines Snapshots (intern auf max. ~1600 px Breite skaliert):

1. **Kandidaten finden (lokal, < 1 s):**
   - „Form + Farbe": HSV-Farbmaske auf die Referenzfarbe → zusammenhängende
     Farbflecken plausibler Größe (Connected Components) werden Kandidaten-Boxen.
   - „Nur Form": Segmentierung über Kanten/Farbcluster, zusätzlich überlappendes
     Kachelraster als Fallback.
   - Priorisierung nach Farbähnlichkeit und Größe; **max. ~20 Kandidaten** pro Scan
     (Brickognize-Limit 60/min; mehr Kandidaten = längere Wartezeit).
2. **Identifikation (Brickognize):** Jeder Kandidat wird mit Rand ausgeschnitten und
   an `POST /predict/parts/` geschickt, 4–6 parallel, gedrosselt. Treffer = gesuchte
   Teilenummer unter den Top-Vorhersagen mit Score über Schwelle.
3. **Farb-Verifikation (lokal):** Bei „Form + Farbe" wird die mittlere Farbe des
   Treffers mit der Referenz verglichen; Abweichung → gelbe statt grüne Markierung.
4. **Anzeige:** Rahmen sortiert nach Konfidenz im Standbild.

## Architektur & Dateien

Kein Framework, kein Build-Tool, kein Backend — nur statische Dateien:

| Datei | Zweck |
|---|---|
| `index.html` | Struktur beider Screens, mobile-first, dunkles Design |
| `style.css` | Layout |
| `js/app.js` | UI-Steuerung, Screen-Wechsel, App-Zustand |
| `js/camera.js` | `getUserMedia` (Rückkamera), Fallback `<input type="file" capture>` |
| `js/segmentation.js` | Kandidatensuche (HSV-Maske, Connected Components, Kacheln) — reine Funktionen, kein DOM |
| `js/brickognize.js` | API-Client: Upload, Drosselung, Parallelisierung, Retry |
| `js/color.js` | Farbextraktion/-vergleich (RGB→HSV, Ähnlichkeitsmaß) — reine Funktionen |

Persistenz: gesuchtes Teil + Farbmodus in `localStorage`.

## Fehlerbehandlung

- Kamera verweigert/fehlend → Datei-Upload-Fallback mit Hinweis.
- Brickognize nicht erreichbar / 429 → verständliche Meldung, automatischer Retry
  mit Wartezeit, sichtbarer Fortschrittszähler.
- Referenzfoto ohne brauchbaren Treffer → Hinweis „nochmal fotografieren: ein Stein,
  neutraler Hintergrund, gutes Licht".
- Offline → Meldung, dass die Identifikation Internet braucht.

## Tests

- **Unit-Tests (Node, ohne Browser):** `segmentation.js` und `color.js` mit
  synthetischen Bilddaten (z.B. „roter Fleck auf grauem Grund → 1 Kandidat mit
  korrekter Box"); `brickognize.js` mit gemocktem `fetch`.
- **Manuell:** Kamera/UI am PC mit Webcam, dann am Handy über das Hosting.

## Bekannte Grenzen (v1)

- Verdeckte Steine im Haufen sind nicht auffindbar (physikalisch bedingt);
  Workflow: umrühren und neu scannen.
- Brickognize ist ein Gratis-Dienst ohne SLA; kommerzielle Nutzung wäre mit dem
  Autor zu klären. Für den Hobby-Einsatz unkritisch.
- Ein Scan kostet 5–20 s Wartezeit (API-Roundtrips).
- Upgrade-Pfad für bessere Kandidaten-Boxen: eigener Ein-Klassen-YOLO-Detektor
  (ONNX Runtime Web), siehe Recherche.
