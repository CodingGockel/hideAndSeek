# Hide & Seek Amsterdam — Spec V1

Begleit-App für ein Hide-and-Seek-Spiel nach dem Vorbild von *Jet Lag: The Game*.
Spielgebiet: alle Bahn-/Metro-Stationen, die mit dem **Amsterdam & Region Travel Ticket** (3 Tage, €44) erreichbar sind.

---

## 1. Leitplanken

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Frontend | Vue 3 + Vite + TypeScript | Client-only, statisch deploybar |
| Karte | Leaflet + Raster-Tiles | klein, stabil auf alten Handys, kein API-Key, Overlays trivial |
| State | Pinia + `localStorage` | kein Backend, kein Sync — Absprache läuft über eure Chat-Gruppe |
| Geometrie | Turf.js nur im Build-Skript | Das Gebiets-Polygon entsteht vorab; im Client reicht Haversine + Leaflet |
| Daten | statische JSON/GeoJSON in `public/data/` | zur Laufzeit per `fetch()` — **ohne Rebuild austauschbar** |
| Offline | vorerst nein | PWA als späterer Ausbau vorgesehen, Architektur blockiert ihn nicht |
| Hosting | GitHub Pages / Cloudflare Pages | statisch. **HTTPS ist Pflicht**, sonst kein `geolocation` |

**Bewusst nicht in V1:** Server, Accounts, Echtzeit-Sync, Push, Foto-Upload, Routing/Fahrplan.

---

## 2. Scope

### V1 — „Die Karte" (dieser Entwurf)
1. Vollbild-Karte, mobile-first
2. Spielgebiet als Polygon-Overlay
3. Alle erlaubten Stationen als Marker, gefiltert nach Verkehrsmittel
4. **Versteck-Radius:** 800 m um die gewählte Station als Kreis — das ist die Versteck-Regel
5. **Gültigkeitsprüfung:** eigener Standort vs. Radius — „du bist 240 m von Haarlem, gültig"
6. Eigener Standort (live) + „Zentrieren"-Button
7. Stationsliste im Bottom Sheet, nach Entfernung sortiert, Suche
8. Detail zu einer Station: Name, Betreiber, Linien, Entfernung, Link zu Maps
9. Umschalter zwischen drei Basiskarten (Standard, ÖPNV, Satellit)

**Spielregel, die die App abbildet:** Verstecke sind **ausschließlich Stationen**. Der Hider muss
sich innerhalb von 800 m Luftlinie um eine Station aufhalten. Der Radius ist in `config.json`
konfigurierbar, nicht im Code festgenagelt — ihr werdet ihn beim Spielen nachjustieren wollen.

### V2 — Fragen-Engine (der eigentliche Nutzen)
Jede beantwortete Frage schränkt die Menge möglicher Verstecke ein. Die App zeichnet die
Einschränkung und **graut ausgeschlossene Stationen aus** — das ersetzt das Papier-Gefummel.

| Frage-Typ | Eingabe | Geometrie | Wirkung auf Stationen |
|---|---|---|---|
| **Radar** | Radius r, Ja/Nein | Kreis um Seeker-Position | Ja → alles außerhalb raus; Nein → alles innerhalb raus |
| **Thermometer** | Punkt A → Punkt B, wärmer/kälter | Mittelsenkrechte zu AB | behält die Halbebene der wärmeren Seite |
| **Measuring** | Referenz (Meer, Zentrum, …), näher/weiter | Distanzvergleich | filtert per berechnetem Attribut |
| **Matching** | Attribut (Linie, Betreiber, Zone, Anfangsbuchstabe), gleich/ungleich | — | reiner Attributvergleich |
| **Tentacles** | POI-Kategorie + Radius, genannter POI | nächster-POI-Zuordnung | behält Stationen, deren nächster POI der genannte ist |

Konsequenz fürs Datenmodell: Jede Station braucht eine **stabile ID** und **abfragbare Attribute**.
Der Spielstand ist dann nur eine Liste von Fragen — die ausgeschlossenen Stationen werden daraus
jederzeit neu berechnet (also: Undo gratis, kein kaputter Zustand).

### V3 — Flüche & POIs
- Fluch-Katalog aus JSON, aktive Flüche mit Timer
- Vorab extrahierte POIs (Museen, Cafés, Zoos, Kinos, Parks) als eigene Layer für Tentakel-Fragen
- Radien-Zeichenwerkzeug frei auf der Karte

---

## 3. Datenmodell

Alles liegt in `public/data/` und wird zur Laufzeit geladen. Ändern = Datei tauschen, kein Build.

### `stations.json`
```jsonc
{
  "version": 1,
  "generatedAt": "2026-08-31",
  "source": "OpenStreetMap via Overpass, manuell kuratiert",
  "stations": [
    {
      "id": "nl-ams-centraal",          // stabil, wird für Spielstände referenziert
      "name": "Amsterdam Centraal",
      "lat": 52.3789,
      "lon": 4.9005,
      "modes": ["train", "metro", "tram", "ferry"],
      "operators": ["NS", "GVB"],
      "lines": ["M51", "M52", "M53", "M54"],
      "ticketValid": true,              // false schliesst die Station vom Spiel aus
      "osmId": "node/26913906",
      "notes": ""
    }
  ]
}
```

### `area.geojson`
Ein `Polygon`/`MultiPolygon` mit dem Spielgebiet. **Nur visuell** — normativ ist die Stationsliste.
Wird als weiches Overlay gezeichnet (Rest der Welt abgedunkelt), damit sofort klar ist, wo Schluss ist.

### `config.json`
Startposition, Zoom-Grenzen, Versteck-Radius, die Liste der Basiskarten und die Farben pro `mode`.

### `poi.json` *(ab V3)*
Gleiche Struktur, plus `category` (`museum` | `cafe` | `zoo` | `cinema` | `park`).

---

## 4. Architektur

```
public/data/          stations.json · area.geojson · config.json   ← zur Laufzeit geladen
scripts/
  fetch-stations.mjs  Overpass → stations.json (Rohentwurf zum Kuratieren)
  fetch-pois.mjs      Overpass → poi.json (V3)
src/
  components/
    GameMap.vue           Karten-Host, besitzt die Leaflet-Instanz
    StationLayer.vue      Marker + Clustering
    AreaLayer.vue         Spielgebiet-Overlay
    BottomSheet.vue       Snap-Punkte: peek / halb / voll
    StationList.vue       sortiert nach Entfernung, mit Suche
    StationDetail.vue
    LayerControls.vue     Filter nach Verkehrsmittel
  composables/
    useLeafletMap.ts      Leaflet direkt kapseln
    useGeolocation.ts     watchPosition + Permission-Handling
    useGameData.ts        JSON laden, validieren, cachen
    useDistances.ts
  stores/
    game.ts               Pinia, in localStorage gespiegelt
  types/game.ts
```

**Leaflet wird direkt benutzt, nicht über einen Vue-Wrapper.** Die Wrapper hinken Versionen
hinterher und stehen genau da im Weg, wo es interessant wird (Halbebenen, dynamische Kreise,
Canvas-Renderer). Ein Composable, das die Map-Instanz hält und bei `onUnmounted` aufräumt,
ist weniger Code als der Wrapper.

Marker über `L.canvas()` rendern — bei ~150 Stationen auf einem Mittelklasse-Handy ist
DOM-Marker-Rendering beim Zoomen spürbar ruckelig, Canvas nicht.

---

## 5. Mobile-First UI

```
┌──────────────────────────┐
│ ▸ Statusleiste  (schlank)│  Rolle · aktive Frage · Timer
├──────────────────────────┤
│                          │
│         KARTE            │  Vollbild, Spielgebiet abgesetzt
│                       ⊙  │  FAB: eigener Standort
│                          │
├──────────────────────────┤
│ ══ Bottom Sheet ══       │  peek: „12 Stationen in der Nähe"
│ Stationen · Filter       │  halb: Liste  ·  voll: Detail
└──────────────────────────┘
```

Harte Regeln, weil das Ding im Zug mit einer Hand bedient wird:
- `100dvh` statt `100vh`, plus `env(safe-area-inset-*)` — sonst verdeckt die iOS-Leiste die Controls
- Touch-Targets ≥ 44 px, Fließtext ≥ 14 px
- Alle primären Aktionen im unteren Bildschirmdrittel (Daumenzone)
- Dark Mode über `prefers-color-scheme`, Basiskarte passend gewechselt
- `watchPosition` mit `enableHighAccuracy`, aber pausieren, wenn die Seite im Hintergrund ist (Akku)

**Basiskarten:** drei zur Auswahl, alle ohne API-Key, konfiguriert in `config.json`:

| Karte | Quelle | wofür |
|---|---|---|
| Standard | OpenStreetMap | Orientierung, Strassennamen |
| ÖPNV | ÖPNVKarte (memomaps) | zeigt Linien und Netz — für ein Spiel über Nahverkehr das nützlichste Bild |
| Satellit | Esri World Imagery | Gelände und Bebauung, um Verstecke einzuschätzen |

CARTO Positron wäre optisch die bessere Grundkarte, verlangt aber inzwischen einen
API-Key — die Kacheln kommen sonst mit „API KEY REQUIRED" quer über der Karte.

Die Anpassung an das Farbschema macht ein CSS-Filter: leichte Entsättigung im Hellen,
Invertierung plus Farbkreisdrehung im Dunklen. Der Filter sitzt auf dem Layer-Container,
nicht auf der Tile-Pane — nur so bleiben Marker und Radien unberührt **und** lassen sich
Luftbilder ausnehmen, aus denen die Invertierung sonst ein Negativ machen würde.

**Stationsmarker:** Piktogramm des Verkehrsmittels (Zug, „M" für Metro, Tram) in Weiss auf
der Modusfarbe. Umsteigeknoten tragen einen zweiten Ring in der Farbe des weiteren
Verkehrsmittels. Unterhalb von Zoom 12 schrumpfen sie auf schlichte Punkte — volle Pins
verklumpen in der Innenstadt sonst zu einem unlesbaren Haufen.

**Attribution:** Das Leaflet-Branding ist abgeschaltet, die Attribution der Kartendaten
bleibt (Lizenzpflicht), eingeklappt auf ein antippbares „i". Das ist die von OpenStreetMap
für kleine Displays vorgesehene Form.

## 6. Datenbeschaffung

Startpunkt per Overpass, danach **von Hand kuratieren**:

```overpassql
[out:json][timeout:90];
(
  nwr["railway"="station"](52.05,4.30,52.75,5.40);
  nwr["railway"="halt"](52.05,4.30,52.75,5.40);
);
out center tags;
```

`scripts/fetch-stations.mjs` normalisiert daraus Namen, leitet `modes` aus den Tags ab
(`station=subway` → metro, `station=light_rail`, sonst train), vergibt stabile IDs und führt
Bahn- und Metro-Objekte am selben Knoten räumlich zusammen. Alle Treffer gelten als bespielbar.

Es gibt keine öffentlich publizierte Liste der NS-Bahnhöfe, an denen die Ticket-Gültigkeit
endet — I amsterdam sagt nur „NS trains within the Amsterdam Area". Statt das im Datenmodell
mit Prüf- und Grenzfall-Zuständen abzubilden, sind schlicht alle gefundenen Stationen im Spiel.
Wer eine ausschliessen will, setzt `ticketValid: false` in `stations.json` — mehr Mechanik
braucht es dafür nicht.

## 7. Entschieden

1. **Tram/Bus:** raus. Nur NS-Bahnhöfe und GVB-Metro sind Verstecke. Das hält die Liste bei ~150
   statt mehreren Hundert Punkten und macht die Karte auf dem Handy überhaupt erst lesbar.
2. **Verstecke:** ausschließlich Stationen, 800 m Radius (s. §2).
3. **Timer und Rollen:** nicht in der App. Bleibt bei euch im Chat, spart die halbe Statusleiste.
4. **Spielgebiet-Polygon:** wird zur Build-Zeit als konvexe Hülle aus `stations.json` erzeugt
   (`npm run build:area`). Damit ist das Gebiet automatisch konsistent mit der Stationsliste —
   auch nachdem du Stationen nachgezogen hast. Ein handgezeichnetes `area.geojson` überschreibt es,
   falls ihr das Gebiet später bewusst enger zieht.

## 8. Status

V1 ist umgesetzt und im Browser gegengeprüft (Standort emuliert, Auswahl, Suche, Radien).
73 Stationen: 44 Bahn, 39 Metro, davon 10 Umsteigeknoten.

Alle 73 Stationen sind bespielbar. Einzelne lassen sich über `ticketValid: false` in
`public/data/stations.json` ausschliessen — die Datei ist von Hand editierbar, ohne dass
etwas neu gebaut werden muss.

### Beim Bauen aufgefallen

- Ein Welt-Ring bis ±90° Breite lässt sich in Web-Mercator nicht projizieren; das
  Spielgebiet-Overlay wurde dadurch gar nicht gezeichnet. Grenze ist ±85,05°.
- `L.circle(...).getBounds()` funktioniert nur, wenn das Circle an einer Karte hängt —
  sonst kommen NaN-Bounds heraus. `L.latLng(...).toBounds(meter)` rechnet kartenunabhängig.
- Leaflets `flyToBounds` hat die Karte im Test nicht bewegt, `fitBounds` schon.
- OSM benennt Bahn und Metro am selben Knoten unterschiedlich („Amsterdam Centraal" vs.
  „Centraal Station"). Stationen müssen räumlich zusammengeführt werden, nicht über den Namen.
