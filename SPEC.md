# Hide & Seek Amsterdam — Spec V1

Begleit-App für ein Hide-and-Seek-Spiel nach dem Vorbild von *Jet Lag: The Game*.
Spielgebiet: alle Haltestellen, die mit dem **Amsterdam & Region Travel Ticket** (3 Tage, €44) erreichbar sind — Bahn, Metro, Tram, Bus und Fähre.

---

## 1. Leitplanken

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Frontend | Vue 3 + Vite + TypeScript | Client-only, statisch deploybar |
| Karte | Leaflet + Raster-Tiles | klein, stabil auf alten Handys, kein API-Key, Overlays trivial |
| State | Pinia + `localStorage` | kein Backend, kein Sync — Absprache läuft über eure Chat-Gruppe |
| Geometrie | Turf.js nur im Build-Skript | Das Gebiets-Polygon entsteht vorab; im Client reicht Haversine + Leaflet |
| Daten | statische JSON/GeoJSON in `public/data/` | zur Laufzeit per `fetch()` — **ohne Rebuild austauschbar** |
| Offline | nein | Manifest für den Homescreen-Start ist da, aber kein Service Worker — die Architektur blockiert ihn nicht |
| Hosting | GitHub Pages / Cloudflare Pages | statisch. **HTTPS ist Pflicht**, sonst kein `geolocation` |

**Bewusst nicht in V1:** Server, Accounts, Echtzeit-Sync, Push, Foto-Upload, Routing/Fahrplan.

---

## 2. Scope

### V1 — „Die Karte" (dieser Entwurf)
1. Vollbild-Karte, mobile-first
2. Spielgebiet als Polygon-Overlay
3. Alle erlaubten Halte als Marker, gefiltert nach Verkehrsmittel
4. **Versteck-Radius:** 800 m um den gewählten Halt als Kreis — das ist die Versteck-Regel
5. **Gültigkeitsprüfung:** eigener Standort vs. Radius — „du bist 240 m von Haarlem, gültig"
6. Eigener Standort (live) + „Zentrieren"-Button; alternativ von Hand auf der Karte
   gesetzt und dort verschiebbar
7. Haltestellenliste im Bottom Sheet, nach Entfernung sortiert, Suche
8. Detail zu einem Halt: Name, bedienende Linien je Verkehrsmittel, Entfernung, Link zu Maps
9. Umschalter zwischen drei Basiskarten (Standard, ÖPNV, Satellit)

**Standortquellen:** Ortung und ein von Hand gesetzter Punkt liegen getrennt im Store,
der gesetzte hat Vorrang. Andernfalls würde ihn das nächste GPS-Update überschreiben und
das Setzen wäre wirkungslos — mit `watchPosition` passiert das im Sekundentakt.

**Spielregel, die die App abbildet:** Verstecke sind **ausschließlich Haltestellen** (die
Spielerklärung: „Dein Zentrum ist die Station/Haltestelle, nicht dein genauer Standort"). Der
Hider muss sich innerhalb von 800 m Luftlinie um einen Halt aufhalten. Der Radius ist in
`config.json` konfigurierbar, nicht im Code festgenagelt — ihr werdet ihn beim Spielen
nachjustieren wollen. (Die Quelldatei nennt 700 m; das ist nur der Abstand, auf den Bus- und
Tramhalte ausgedünnt wurden, nicht der Spielradius.)

### V2 — Fragekarten (umgesetzt)

Alle 69 Karten aus `jetlag_questions_medium.json` stehen als durchsuchbare Liste zum
Abhaken bereit. 38 davon lassen sich auf der Karte zeichnen.

**Entwurfsentscheidung:** Halte werden *nicht* automatisch ausgeschlossen — die
Geometrie wird gezeichnet, die Schlussfolgerung zieht der Spieler. Daraus folgt, dass
die **Überlagerung** die Arbeit tun muss: ein einzelner Kreis hilft wenig, drei Kreise
und eine Halbebene übereinander zeigen den verbleibenden Bereich. Zentrales Objekt ist
deshalb nicht „die aktive Frage", sondern eine Liste von Einschränkungen, die
gleichzeitig auf der Karte liegen, jede in eigener Farbe, einzeln ausblendbar.

| Frage-Typ | Zeichenbar | Geometrie |
|---|---|---|
| **Radar** (8) | alle | Kreis um A; „ja" gefüllt, „nein" abgedunkelt und gestrichelt |
| **Thermometer** (3) | alle | A gesetzt, B per Tap; Mittelsenkrechte, kalte Seite abgedunkelt |
| **Tentacles** (4) | alle | Kreis plus die Orte darin |
| **Matching** (20) | 11 | Orte in der Nähe, der nächstgelegene hervorgehoben |
| **Measuring** (20) | 12 | Isodistanz (s. u.) |
| **Photos** (14) | 0 | rein soziale Mechanik |

Die **Isodistanz** ist der eleganteste Fall: Die Menge aller Punkte, die näher an
*irgendeinem* Museum liegen als der Fragende, ist exakt die Vereinigung gleich grosser
Kreise um alle Museen — mit dem eigenen Abstand zum nächsten als Radius. Exakt zeichenbar,
ganz ohne Voronoi.

„Karte" zeichnet die Geometrie sofort als neutrale Vorschau, bevor eine Antwort gewählt
ist — sonst müsste man sich für ja oder nein entscheiden, ohne zu sehen, worüber man
entscheidet. Die Vorschau wird nicht gespeichert und verschwindet beim Verlassen des
Fragen-Bereichs.

Der Bezugspunkt einer Einschränkung wird beim Anlegen **eingefroren**. Mit der
Live-Position würde der Kreis mitwandern und seine Aussage verlieren. A und B sind auf
der Karte verschiebbar.

**Abweichung vom Original:** Radar- und Thermometer-Werte sind metrisch und auf das
Gebiet zugeschnitten (500 m bis 40 km statt bis 161 km). Bei 45 × 40 km Spielgebiet
schliessen die oberen Original-Stufen nichts mehr aus. Dadurch 69 statt 71 Karten.

Nicht zeichenbar bleiben Verwaltungsgrenzen, Küstenlinie, Gewässer, Bahn- und
Strassenlinien sowie Höhe über NN — die brauchen Polygon- und Liniengeometrie und lassen
sich später ergänzen, ohne den Unterbau zu ändern.

### V3 — Flüche
- Fluch-Katalog aus JSON, aktive Flüche mit Timer
- Freies Radien-Zeichenwerkzeug auf der Karte
- Voronoi-Zellen für Matching, um die zulässige Fläche exakt zu zeigen
- Verwaltungsgrenzen und Küstenlinie als Polygone — schaltet die restlichen
  Matching-/Measuring-Karten frei

---

## 3. Datenmodell

Alles liegt in `public/data/` und wird zur Laufzeit geladen. Ändern = Datei tauschen, kein Build.

### `stations.json`
```jsonc
{
  "version": 2,
  "generatedAt": "2026-09-03",
  "source": "data/artt_verstecke.geojson (kuratierte ARTT-Versteckliste)",
  "stations": [
    {
      "id": "amsterdam-centraal",       // stabil, wird für Spielstände referenziert
      "name": "Amsterdam Centraal",
      "aliases": ["Centraal Station"],  // Zweitname der Quelle, nur für die Suche
      "lat": 52.37897,
      "lon": 4.90042,
      "mode": "train",                  // wonach gefiltert und eingefärbt wird
      "lines": {                        // wer hier hält, je Verkehrsmittel
        "train": ["Intercity", "Sprinter", "…"],
        "metro": ["51", "52", "53", "54"],
        "tram": ["2", "4", "14", "17", "24", "26"],
        "bus": ["18", "21", "…"],
        "ferry": ["F2", "F3", "F4"]
      },
      "isStation": true,                // Bahnhof — für „nächster Bahnhof"
      "extraCost": false,               // true = ausserhalb des Tickets, Aufpreis
      "ticketValid": true,              // false schliesst den Halt vom Spiel aus
      "notes": ""
    }
  ]
}
```

`mode` ist einwertig und trägt den Filter: der Halt steht wegen genau eines Verkehrsmittels
in der Liste. Die Linien-Spalten sagen zusätzlich, was dort sonst noch hält — daraus kommt
der zweite Ring am Marker (Bus dabei ausgenommen: er hält fast überall und der Ring wäre
dann bedeutungslos).

### `area.geojson`
Ein `Polygon`/`MultiPolygon` mit dem Spielgebiet. **Nur visuell** — normativ ist die Haltestellenliste.
Wird als weiches Overlay gezeichnet (Rest der Welt abgedunkelt), damit sofort klar ist, wo Schluss ist.

### `config.json`
Startposition, Zoom-Grenzen, Versteck-Radius, die Liste der Basiskarten und die Farben pro `mode`.

### `poi.json`
Rund 2000 Orte in 11 Kategorien (Museum, Bibliothek, Kino, Krankenhaus, Park, Zoo,
Golfplatz, Freizeitpark, Konsulat, Flughafen, Aquarium), erzeugt von
`scripts/fetch-pois.mjs`. Rahmen bewusst grösser als das Spielgebiet, sonst bekämen
Randstationen ein falsches „nächstes Museum". Kompakt geschrieben (225 kB, 49 kB gzip) —
die Datei wird nie von Hand bearbeitet.

Zwei Filter sind entscheidend: `zoo=petting_zoo` fliegt raus (163 von 193 „Zoos" sind
niederländische Kinderbauernhöfe), und als Flughafen zählt nur, was einen IATA-Code hat
(ein ICAO-Code reicht nicht, den hat auch ein Segelflugplatz).

### `questions.json`
Erzeugt von `scripts/build-questions.mjs` aus `jetlag_questions_medium.json`: stabile ID
je Frage (damit Häkchen einen Neustart überstehen), Visualisierungstyp, POI-Bezug. Das
Skript liest `poi.json` und markiert Fragen automatisch als **schwach**, wenn die Daten
sie entwerten — bei nur einem Flughafen ist „gleicher nächster Flughafen?" immer „ja".

---

## 4. Architektur

```
public/data/          stations.json · area.geojson · config.json   ← zur Laufzeit geladen
scripts/
  import-stations.mjs data/artt_verstecke.geojson → stations.json
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
│                  [Ortung]│  grau: aus · grün: gültiges Versteck · rot: keins
│                      +/− │
│         KARTE            │  Vollbild, Spielgebiet abgesetzt
│                          │
│              [Standard]  │  Karte · Standort setzen · Alle Radien
├──────────────────────────┤
│ ══ Bottom Sheet ══       │  peek: „12 Haltestellen in der Nähe"
│ Haltestellen · Filter    │  halb: Liste  ·  voll: Detail
└──────────────────────────┘
```

Ein Statusbalken über der Karte war der erste Entwurf; er kostete rund 56 px Höhe für
eine Aussage, die in eine Farbe passt. Geblieben ist der Ortungsknopf oben rechts: er
ist zugleich Schalter (Ortung an · Zentrieren · GPS nutzen) und Anzeige — grau ohne
Standort, grün im Versteck-Radius, rot ausserhalb. Der ausführliche Text steht im
`title`, Ortungsfehler erscheinen als wegklickbare Einblendung.

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

**Haltestellenmarker:** Piktogramm des Verkehrsmittels (Zug, „M" für Metro, Tram, Bus,
Fähre) in Weiss auf der Modusfarbe. Umsteigeknoten tragen einen zweiten Ring in der Farbe
des weiteren Verkehrsmittels, Halte ausserhalb des Tickets einen gestrichelten Rand.
Unterhalb von Zoom 13 schrumpfen sie auf schlichte Punkte — bei 459 Markern verklumpen
volle Pins in der Innenstadt sonst zu einem unlesbaren Haufen.

**Attribution:** Das Leaflet-Branding ist abgeschaltet, die Attribution der Kartendaten
bleibt (Lizenzpflicht), eingeklappt auf ein antippbares „i". Das ist die von OpenStreetMap
für kleine Displays vorgesehene Form.

## 6. Datenbeschaffung

Quelle ist `data/artt_verstecke.geojson`: die von Hand kuratierte Liste aller Halte im
Geltungsbereich des Tickets — Bahn, Metro und Fähre vollständig, Bus und Tram auf 650 m
Abstand ausgedünnt, je Halt die bedienenden Linien, dazu `in_artt` (im Ticket) und
`is_station` (Bahnhof).

`scripts/import-stations.mjs` macht daraus `stations.json`: Linien-Spalten aufsplitten,
IDs vergeben (`slug(name)`, bei Namensgleichheit an verschiedenen Orten mit dem Modus
ergänzt — Zaandam ist Bahnhof *und* Fähranleger) und die doppelt geführten Bahnhöfe
zusammenlegen. Die stehen einmal unter dem NS-Namen („Amsterdam Centraal") und einmal
unter dem GVB-Namen („Centraal Station"); die Paare liegen unter 100 m auseinander, das
nächste echte Bahnhofspaar über 800 m, deshalb trennt ein 300-m-Schwellwert sicher. Der
verworfene Name bleibt als `aliases` erhalten, damit die Suche ihn findet.

Vorher kam die Liste aus OpenStreetMap (`fetch-stations.mjs`, entfallen). Overpass kennt
die Ticket-Grenze nicht — die kuratierte Datei schon, und zwar mit dem Zwischenzustand
„erreichbar, aber gegen Aufpreis" (`extraCost`). Solche Halte sind bespielbar, in Liste und
Karte markiert und zählen auch fürs Gebiet — die Hülle reicht dadurch bis Utrecht und
Alkmaar. Wer einen Halt ganz ausschliessen will, setzt `ticketValid: false` in
`stations.json`; nur das hält ihn aus Karte, Liste und Gebiet heraus.

## 7. Entschieden

1. **Tram/Bus:** drin. Ursprünglich waren nur NS-Bahnhöfe und GVB-Metro Verstecke, um die
   Liste bei ~150 Punkten und die Karte lesbar zu halten. Die Spielerklärung nennt aber
   ausdrücklich die *Haltestelle* als Zentrum der Zone, und mit der kuratierten Liste (Bus
   und Tram auf 650 m ausgedünnt) bleiben es 459 Punkte. Lesbar bleibt die Karte über den
   Filter je Verkehrsmittel und die Punkt-Darstellung unterhalb von Zoom 13.
2. **Verstecke:** ausschließlich Haltestellen, 800 m Radius (s. §2).
3. **Timer und Rollen:** nicht in der App. Bleibt bei euch im Chat, spart die halbe Statusleiste.
4. **Spielgebiet-Polygon:** wird zur Build-Zeit als konvexe Hülle über alle bespielbaren
   Halte erzeugt (`npm run data:area`), die Aufpreis-Bahnhöfe eingeschlossen. Damit ist das
   Gebiet automatisch konsistent mit der Haltestellenliste — auch nachdem du Halte nachgezogen
   hast. Ein handgezeichnetes `area.geojson` überschreibt es, falls ihr das Gebiet später
   bewusst enger zieht.

## 8. Status

V1 und V2 sind umgesetzt und im Browser gegengeprüft.

- 459 Halte (63 Bahn, 29 Metro, 52 Tram, 300 Bus, 15 Fähre), davon 16 nur gegen Aufpreis;
  alle liegen im Spielgebiet
- 2006 Orte in 11 Kategorien
- 69 Fragekarten, 38 davon auf der Karte zeichenbar, 3 automatisch als schwach erkannt

### Beim Bauen aufgefallen

- Ein Welt-Ring bis ±90° Breite lässt sich in Web-Mercator nicht projizieren; das
  Spielgebiet-Overlay wurde dadurch gar nicht gezeichnet. Grenze ist ±85,05°.
- `L.circle(...).getBounds()` funktioniert nur, wenn das Circle an einer Karte hängt —
  sonst kommen NaN-Bounds heraus. `L.latLng(...).toBounds(meter)` rechnet kartenunabhängig.
- Leaflets `flyToBounds` hat die Karte im Test nicht bewegt, `fitBounds` schon.
- `fitBounds` auf einen einzelnen Punkt ergibt ein leeres Rechteck und damit die höchste
  Zoomstufe — bei Matching und Measuring war danach von der Geometrie nichts mehr zu
  sehen. Ohne Radius braucht es einen festen Ersatz-Umkreis.
- Bahn und Metro am selben Knoten heissen unterschiedlich („Amsterdam Centraal" vs.
  „Centraal Station") — in OSM wie in der kuratierten Liste. Halte müssen räumlich
  zusammengeführt werden, nicht über den Namen.
- „Ist dein nächster Bahnhof meiner?" galt als schwache Frage, weil der Hider per Regel an
  einem Bahnhof stand. Mit Tram- und Bushaltestellen als Verstecken sagt sie wieder etwas
  aus — sie zeichnet deshalb nur die 63 Bahnhöfe (`isStation`), nicht jeden Halt.
- CARTO-Basiskarten verlangen inzwischen einen API-Key und schreiben sonst
  „API KEY REQUIRED" über die Kacheln.
- Beim Prüfen der Zoomstufe über die Kachel-URLs täuscht die erste Kachel im DOM: beim
  Zoomen bleiben alte stehen. Nur die höchste vorhandene Stufe ist die aktuelle.
