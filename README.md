# Hide & Seek — Amsterdam

Spielkarte für ein Hide-and-Seek-Spiel nach dem Vorbild von *Jet Lag: The Game*.
Zeigt das Spielgebiet, alle bespielbaren Stationen und den 800-m-Radius, innerhalb
dessen man sich an einer Station verstecken darf.

Client-only, mobile-first, kein Server. Der Entwurf steht in [SPEC.md](SPEC.md).

## Was die App kann

- Vollbild-Karte mit dem Spielgebiet als Overlay
- Alle Bahn- und Metro-Stationen der Region, filterbar nach Verkehrsmittel
- **Versteck-Radius**: 800 m um die gewählte Station, einzeln oder für alle auf einmal
- **Gültigkeitsprüfung**: „Gültiges Versteck — 300 m von Amsterdam Zuid" anhand des
  eigenen Standorts. Das ist die Frage, die man unterwegs tatsächlich hat.
- **Standort von Hand setzen**: „Standort setzen" antippen, dann auf die Karte tippen.
  Der Punkt lässt sich anschliessend verschieben und ersetzt die Ortung, bis „GPS nutzen"
  gedrückt wird — praktisch zum Planen zu Hause und wenn das GPS im Zug daneben liegt.
  Er überlebt einen Neustart.
- Stationsliste nach Entfernung sortiert, mit Suche
- **Drei Basiskarten** zum Umschalten: Standard, ÖPNV-Karte (zeigt die Linien) und Satellit
- Marker mit Piktogramm des Verkehrsmittels; Umsteigeknoten wie Amsterdam Zuid tragen
  einen zweiten Ring in der Farbe der zweiten Linie
- **Fragenliste** mit allen 69 Fragekarten, durchsuchbar und einzeln abhakbar
- **Fragen auf der Karte**: 38 der 69 Karten lassen sich zeichnen, beliebig viele
  gleichzeitig und in eigenen Farben

## Loslegen

```bash
npm install
npm run dev
```

Zum Testen auf dem Handy im selben WLAN:

```bash
npm run dev -- --host
```

Die **Ortung braucht HTTPS** — Ausnahme ist `localhost`. Über eine `http://192.168.x.x`-Adresse
bleibt der Standort deshalb aus; zum Testen unterwegs die Seite deployen (s. u.).

## Fragekarten

Der Reiter „Fragen" listet alle Karten aus `jetlag_questions_medium.json`, nach Kategorie
gruppiert, mit Zeitlimit und Karten-Belohnung. Ein Häkchen markiert eine Frage als genutzt
(bleibt in `localStorage`, kein Rundenkonzept).

„Karte" zeigt die Geometrie **sofort als Vorschau** — grau gestrichelt, noch ohne
Aussage. Bei Radar sieht man damit erst einmal, wie gross der gewählte Radius überhaupt
ist; die Karte zoomt passend und das Sheet klappt halb ein, sodass die Antwortknöpfe
erreichbar bleiben. Beim frei gewählten Radius wächst der Kreis beim Tippen mit. Erst
die Antwort macht daraus eine farbige, bleibende Einschränkung; ein zweites Antippen von
„Karte" verwirft die Vorschau. Da Stationen bewusst **nicht**
automatisch ausgeschlossen werden, liegen beliebig viele Einschränkungen gleichzeitig
übereinander — der Bereich, den alle offen lassen, ist der gesuchte. Jede Einschränkung
lässt sich einzeln ausblenden oder löschen; die Punkte A und B sind auf der Karte
verschiebbar.

| Kategorie | Darstellung |
|---|---|
| Radar | Kreis um A. „Ja" wird ausgefüllt, „Nein" abgedunkelt und gestrichelt |
| Thermometer | A setzen, dann auf die Karte tippen für B. Die Mittelsenkrechte trennt, die kalte Seite wird abgedunkelt |
| Tentacles | Kreis plus alle Orte der Kategorie darin, je mit Piktogramm (Museum, Zoo, Kino …) |
| Matching | die Orte in der Nähe, der eigene nächstgelegene hervorgehoben |
| Measuring | gleich grosse Kreise um **alle** Orte der Kategorie, mit dem eigenen Abstand zum nächsten als Radius. Die Vereinigung ist genau der Bereich, von dem aus ein Ort näher liegt als von A |
| Photos | nicht zeichenbar, nur abhakbar |

Fragen, die mit den vorhandenen Daten kaum etwas aussagen, sind als **schwach** markiert —
etwa „gleicher nächster Flughafen?" (es gibt nur Schiphol, die Antwort ist immer ja) oder
„gleicher nächster Park?" (über tausend Parks, die Antwort ist fast immer nein).

Radar- und Thermometer-Werte sind metrisch und auf euer Gebiet zugeschnitten (500 m bis
40 km) statt der Original-Meilen bis 161 km, die bei 45 × 40 km Spielgebiet nichts mehr
ausschliessen.

## Stationsdaten pflegen

```bash
npm run data            # alles neu erzeugen
npm run data:stations   # Stationen aus OpenStreetMap
npm run data:area       # Spielgebiet aus der Stationsliste
npm run data:pois       # Orte für die Fragekarten (~2000 Objekte)
npm run data:questions  # Fragekarten mit Zeichen-Metadaten
```

`data:questions` liest `jetlag_questions_medium.json` im Projektwurzelverzeichnis und
braucht `poi.json` und `stations.json`, um die schwachen Fragen zu erkennen — also nach
den beiden anderen laufen lassen (`npm run data` macht das in der richtigen Reihenfolge).

`public/data/stations.json` wird zur Laufzeit geladen und kann **direkt editiert werden,
ohne neu zu bauen**. Alle gefundenen Stationen sind bespielbar. Soll eine doch nicht
dabei sein, `ticketValid: false` setzen — sie verschwindet dann aus Karte und Liste.

`ticketValid`, `lines` und `notes` überleben ein erneutes `npm run data`; die vorhandene
Datei wird gemerged, nicht überschrieben.

Nach dem Bearbeiten `npm run data:area` laufen lassen, damit das Spielgebiet zur
Stationsliste passt.

Tram- und Bushaltestellen sind bewusst nicht enthalten (s. SPEC.md §7).

## Auf dem Handy installieren

Nach dem Deploy die Seite im Browser öffnen und zum Homescreen hinzufügen (iOS: Teilen →
„Zum Home-Bildschirm"; Android: Menü → „App installieren"). Sie startet dann ohne
Browserleiste, was beim Spielen spürbar Kartenfläche spart.

Das ist reine Homescreen-Integration über `public/manifest.webmanifest` — **kein
Offline-Modus**. Ohne Netz bleibt die Karte weiss, dafür gibt es keine Service-Worker-
Cache-Fallen beim Deployen. `start_url` und die Icon-Pfade im Manifest sind relativ und
machen einen anderen Repo-Namen ohne Anpassung mit.

## Deploy

Statisches Bündel, läuft auf GitHub Pages, Netlify oder Cloudflare Pages:

```bash
npm run build     # -> dist/
npm run preview   # lokal gegenprüfen
```

Bei GitHub Pages im Unterverzeichnis muss `base` in `vite.config.ts` gesetzt werden.
**HTTPS ist Pflicht**, sonst funktioniert die Ortung nicht.

## Aufbau

```
public/data/            stations.json · area.geojson · config.json
                        poi.json · questions.json      ← alle zur Laufzeit geladen
scripts/                Datenerzeugung; scripts/lib/overpass.mjs teilen sich die Skripte
src/composables/        Leaflet-Instanz, Stationsebenen, Fragen-Geometrie, Ortung
src/stores/game.ts      Stationen, Karte, Standort
src/stores/questions.ts Fragekarten, Häkchen, Einschränkungen
```

`config.json` enthält den Versteck-Radius, den Kartenausschnitt, die Liste der Basiskarten
und die Farben pro Verkehrsmittel — ebenfalls ohne Rebuild änderbar. Eine weitere Basiskarte
ist ein Eintrag mehr in `basemaps`; `photo: true` nimmt sie vom Dark-Mode-Filter aus.

Karten von [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL), Stationsdaten
ebenfalls aus OSM.
