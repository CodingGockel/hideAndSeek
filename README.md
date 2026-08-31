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
- Stationsliste nach Entfernung sortiert, mit Suche
- **Drei Basiskarten** zum Umschalten: Standard, ÖPNV-Karte (zeigt die Linien) und Satellit
- Marker mit Piktogramm des Verkehrsmittels; Umsteigeknoten wie Amsterdam Zuid tragen
  einen zweiten Ring in der Farbe der zweiten Linie

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

## Stationsdaten pflegen

```bash
npm run data          # Stationen aus OpenStreetMap ziehen + Spielgebiet neu berechnen
npm run data:stations # nur Stationen
npm run data:area     # nur das Gebiets-Polygon
```

`public/data/stations.json` wird zur Laufzeit geladen und kann **direkt editiert werden,
ohne neu zu bauen**. Alle gefundenen Stationen sind bespielbar. Soll eine doch nicht
dabei sein, `ticketValid: false` setzen — sie verschwindet dann aus Karte und Liste.

`ticketValid`, `lines` und `notes` überleben ein erneutes `npm run data`; die vorhandene
Datei wird gemerged, nicht überschrieben.

Nach dem Bearbeiten `npm run data:area` laufen lassen, damit das Spielgebiet zur
Stationsliste passt.

Tram- und Bushaltestellen sind bewusst nicht enthalten (s. SPEC.md §7).

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
public/data/          stations.json · area.geojson · config.json  ← zur Laufzeit geladen
scripts/              Datenerzeugung (Overpass, Gebiets-Polygon)
src/composables/      Leaflet-Instanz, Kartenebenen, Ortung
src/stores/game.ts    gesamter Spielzustand (Pinia, in localStorage gespiegelt)
```

`config.json` enthält den Versteck-Radius, den Kartenausschnitt, die Liste der Basiskarten
und die Farben pro Verkehrsmittel — ebenfalls ohne Rebuild änderbar. Eine weitere Basiskarte
ist ein Eintrag mehr in `basemaps`; `photo: true` nimmt sie vom Dark-Mode-Filter aus.

Karten von [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL), Stationsdaten
ebenfalls aus OSM.
