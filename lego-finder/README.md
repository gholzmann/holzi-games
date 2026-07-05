# 🧱 LEGO-Stein-Finder

Mobile Web-App, die einen bestimmten LEGO-Stein in einer Kiste voller Steine findet.

## Benutzung

1. **Stein erfassen:** Den gesuchten Stein einzeln fotografieren (neutraler
   Hintergrund, gutes Licht). Aus den Vorschlägen den richtigen antippen,
   dann im Foto auf den Stein tippen (bestimmt die Farbe).
   Modus wählen: **Form + Farbe** oder **Nur Form**.
2. **Kiste durchsuchen:** Kamera auf die Kiste richten, **Suchen** tippen.
   Nach 5–20 s werden Treffer markiert: **grün** = Form und Farbe passen,
   **gelb** = richtige Form, andere Farbe. Rahmen antippen zeigt den
   Ausschnitt vergrößert.
3. Nichts gefunden? Steine umrühren oder näher herangehen und neu scannen —
   verdeckte Steine kann keine Kamera sehen.

Das gesuchte Teil wird gemerkt; beim nächsten Öffnen geht es direkt weiter.

## Technik

- Statische Web-App ohne Framework/Build (Vanilla JS, ES Modules)
- Kandidatensuche lokal im Browser (HSV-Farbmaske / Farbcluster + Kachelraster)
- Teile-Identifikation über die kostenlose [Brickognize-API](https://api.brickognize.com/docs)
  (keine Auth, ~60 Anfragen/min → max. 20 Kandidaten pro Scan)

## Entwicklung

- Tests: `npm test` (Node ≥ 18, keine Abhängigkeiten)
- Lokal ausführen: `npm run serve` → http://localhost:8000
  (Kamera funktioniert nur über localhost oder HTTPS)

## Hosting (fürs Handy)

Beliebiges statisches HTTPS-Hosting, z. B. GitHub Pages:
Repo pushen → Settings → Pages → Branch `main`, Ordner `/ (root)` →
URL am Handy öffnen und Kamerazugriff erlauben.

## Grenzen

- Nur oben liegende, sichtbare Steine sind auffindbar.
- Brickognize ist ein Gratis-Dienst ohne Verfügbarkeitsgarantie;
  kommerzielle Nutzung mit dem Autor klären.
- Score-/Farbschwellen (`SCORE_MIN`, `COLOR_TOLERANCE` in `js/app.js`)
  sind Startwerte — bei Bedarf nachjustieren.
