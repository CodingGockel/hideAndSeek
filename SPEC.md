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
Abhaken bereit. 35 davon lassen sich auf der Karte zeichnen.

**Entwurfsentscheidung:** Die App nimmt keine Antworten entgegen. Sie zeigt, *worüber*
eine Frage redet — den Umkreis, die Orte der Kategorie, den nächstgelegenen davon —, und
die Schlussfolgerung zieht der Spieler. Antworten laufen ohnehin über den Chat; ein
zweiter Zustand neben dem Häkchen wäre unterwegs nur Buchhaltung, die niemand pflegt.

Daraus folgt: Es liegt immer **höchstens eine** Geometrie auf der Karte, und sie ist
nicht dauerhaft. Der erste Entwurf sammelte stattdessen beantwortete Fragen als farbige
Einschränkungen, die sich überlagern sollten — der Bereich, den alle offen lassen, wäre
der gesuchte gewesen. Diese Überlagerung steht und fällt damit, dass jede Antwort
eingetragen wird; ohne Ja/Nein gibt es sie nicht mehr. Übrig geblieben ist die Vorschau,
die es schon vorher gab.

Es gibt deshalb nur zwei Farben: alles Neutrale in `--preview`, und in `--accent` genau
das, was die Frage entscheidet — der nächstgelegene Ort und eine gestrichelte Linie mit
der Entfernung dorthin.

| Frage-Typ | Zeichenbar | Geometrie |
|---|---|---|
| **Radar** (8) | alle | gestrichelter Kreis um den Fragepunkt |
| **Tentacles** (4) | alle | Kreis, die Orte darin, der nächstgelegene hervorgehoben |
| **Matching** (20) | 11 | die Orte in der Nähe (bis zu 60), der nächstgelegene hervorgehoben |
| **Measuring** (20) | 12 | dasselbe Bild wie Matching |
| **Thermometer** (3) | 0 | braucht Start- und Zielpunkt, s. u. |
| **Photos** (14) | 0 | rein soziale Mechanik |

**Matching und Measuring zeigen dasselbe Bild.** Die Fragen sind verschieden — Identität
des nächsten Orts gegen Abstand zu ihm —, beantworten lässt sich aber beides nur, indem
man die Orte sieht und weiss, welcher der eigene nächste ist. Measuring zeichnete
zunächst die Isodistanz: die Menge aller Punkte, die näher an *irgendeinem* Museum liegen
als der Fragende, ist exakt die Vereinigung gleich grosser Kreise um alle Museen. Exakt,
elegant, ganz ohne Voronoi — und beim Spielen unbrauchbar, weil sie eine Antwort einfärbt,
die es nicht mehr gibt, und ausgerechnet die Orte weglässt, um die es geht.

**Das Thermometer ist entfallen.** Es braucht einen Start- *und* einen Zielpunkt und lebte
von „wärmer/kälter"; ohne Antworten bleibt eine Mittelsenkrechte ohne Aussage. Die drei
Karten sind wie die Photos-Karten nur noch abhakbar und verschickbar — die gefahrene
Strecke steht im Fragesatz.

Der Bezugspunkt einer Vorschau wird beim Anlegen **eingefroren**: der eigene Standort,
sonst die Kartenmitte. Mit der Live-Position würde der Kreis mitwandern und seine Aussage
verlieren. Verschiebbar ist er nicht — die Vorschau wird nicht gespeichert, ein
verschobener Punkt hielte nur bis zum nächsten Neuzeichnen.

**Abweichung vom Original:** Radar- und Thermometer-Werte sind metrisch und auf das
Gebiet zugeschnitten (500 m bis 40 km statt bis 161 km). Bei 45 × 40 km Spielgebiet
schliessen die oberen Original-Stufen nichts mehr aus. Dadurch 69 statt 71 Karten.

Nicht zeichenbar bleiben Verwaltungsgrenzen, Küstenlinie, Gewässer, Bahn- und
Strassenlinien sowie Höhe über NN — die brauchen Polygon- und Liniengeometrie und lassen
sich später ergänzen, ohne den Unterbau zu ändern.

### V4 — Fragen verschicken (umgesetzt)

Fast jede Karte fragt nach dem Verhältnis zweier Standorte — ohne die Koordinaten des
Suchers ist sie nicht zu beantworten. Bisher lief das über den Chat, von Hand
abgetippt. Jetzt baut die App die Nachricht selbst:

```
Team Rot fragt — Radar
Bist du im Umkreis von 2 km um mich?
Mein Standort: 52.37897, 4.90042
https://www.google.com/maps?q=52.37897,4.90042
In der App beantworten: https://…/#v=1&q=radar%3A2-km&o=52.37897%2C4.90042&r=2000&n=Team+Rot
```

Vier Zeilen mit je einem Zweck: wer fragt und was, wo er steht, derselbe Punkt für alle
ohne die App, und der Link für alle mit ihr. Der Knopf sitzt an **jeder** Karte, auch an
den nicht zeichenbaren — die Photos-Karten leben gerade davon, verschickt zu werden.

**Nur der Hinweg.** Die Antwort kommt als normale Chat-Nachricht zurück und bleibt dort.
Ein Antwort-Link wäre der nächste Schritt (`&a=<answer>` ist im Schema frei), hätte in der
App aber nichts, wohin er führte.

**Link-Schema.** Alles steckt im Fragment, nicht im Query-String: so braucht der
statische Host keine Umschreibregel, und die Koordinaten stehen in keinem Server-Log.

| | |
|---|---|
| `v` | Schema-Version. Passt sie nicht, wird der Link verworfen statt halb gelesen |
| `q` | `Question.id` — daraus kommen Label, Visualisierung und POI-Bezug |
| `o` | Standort des Fragenden, 5 Nachkommastellen (≈ 1 m) |
| `r` | Radius, nur wenn die Karte keinen mitbringt (`radar:frei-waehlbar`) |
| `n` | Absendername, optional |
| `t` | reserviert für den Zielpunkt des Thermometers |

**Beim Empfänger** öffnet der Link die Frage als Vorschau: die Geometrie des Fragenden,
sein Standort als fester Punkt A — dort ist er eine Tatsache aus der Nachricht und kein
Regler — und dazu **von der eigenen Position eine gestrichelte Linie zu jedem Punkt, der
die Antwort entscheidet**, beschriftet mit der Entfernung.

| Kartentyp | Linie(n) von der eigenen Position zu |
|---|---|
| Radar | dem Standort des Fragenden — im Kreis oder nicht, die Zahl macht es eindeutig |
| Matching | dem eigenen nächsten Ort. Läuft die zweite Linie auf denselben Marker, heisst die Antwort „ja" |
| Measuring | dem eigenen nächsten Ort; die beiden beschrifteten Linien nebeneinander sind „näher" oder „weiter" |
| Tentacles | dem nächsten Ort **im Kreis des Fragenden** — dessen Name *ist* die Antwort, deshalb steht er auch im Klartext in der Karte |
| Thermometer | — die Karte zeichnet nichts mehr, s. §2 |

Die App zeigt damit alles, was zur Antwort nötig ist, behauptet sie aber nicht — das
bleibt beim Spieler, wie schon bei den Einschränkungen.

**Grenzen.** Eine feste WhatsApp-Gruppe lässt sich nicht adressieren — `wa.me` kennt nur
einen Chat-Picker oder eine Telefonnummer, keine Gruppen-ID.

### V5 — Sucher-Standort von Hand (umgesetzt)

Der Antwort-Weg aus V4 setzt voraus, dass die Sucher die App benutzen und den Link
schicken. Sie tun das nicht immer — oft steht in der Gruppe nur „wir sind bei
52.37897, 4.90042". Deshalb lässt sich derselbe Punkt auch von Hand eintragen: ein
Knopf „Sucher" auf der Karte, ein Textfeld, ein Zahlenpaar.

Von da an ist es **derselbe Zustand wie ein erhaltener Link**: das Karten-Icon einer
Frage legt ihre Geometrie um den Sucher-Standort und zieht von der eigenen Position die
gestrichelten Vergleichslinien (§V4, Tabelle). Es gibt keinen neuen Kartentyp und keinen
zweiten Zeichenweg — nur eine Weiche in `onPreviewQuestion`: mit Sucher-Standort
`setIncoming`, ohne ihn wie bisher `setPreview` um die eigene Position.

Bewusst schmal gehalten:

- **Nur ein Standort.** Eine Liste benannter Teams wäre Zustand, den unterwegs niemand
  pflegt; gefragt hat ohnehin gerade eines.
- **Nur ein Textfeld**, kein Setzen per Kartentipp und kein Ziehen des Markers. Der Punkt
  ist eine Angabe aus dem Chat, keine Schätzung — er wird abgetippt, nicht gepeilt.
- **Bleibt liegen**, auch beim Tab-Wechsel und über einen Neustart (`hs.prefs.v2`). Er
  darf deshalb nicht in `preview`/`incoming` stehen: die räumt `clearPreview()` weg.

Der Marker ist ein Ring in der Vorschau-Farbe, kein Punkt: liegt eine Frage an, setzt
sich der Ankerpunkt der Vorschau genau in seine Mitte, statt ihn zu verdecken.

Dabei fiel ein Fehler auf, der auch den Link-Weg betraf: `focusPreview` passte den
Ausschnitt nur um den Fragepunkt an. Steht der Sucher ein paar Kilometer weiter, lief die
eigene Vergleichslinie aus dem Bild — die halbe Aussage. Die Bounds schliessen jetzt bei
`compareToUser` die eigene Position ein.

### V3 — Flüche
- Fluch-Katalog aus JSON, aktive Flüche mit Timer
- Freies Radien-Zeichenwerkzeug auf der Karte
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
    usePreviewLayers.ts   Geometrie der gerade gezeigten Frage
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
│           [Standard]  ‹  │  Karte · Standort setzen · Sucher · Alle Radien · Hell/Dunkel
├──────────────────────────┤
│ ══ Bottom Sheet ══       │  peek: „12 Haltestellen in der Nähe"
│ Haltestellen · Filter    │  halb: Liste  ·  voll: Detail
└──────────────────────────┘
```

Die Knopfleiste rechts fährt über den Pfeil an ihrem unteren Ende nach rechts aus dem Bild
und gibt die Karte frei; der Zustand liegt bei den übrigen Einstellungen. Der Ortungsknopf
bleibt aussen vor — er ist zugleich Anzeige und muss immer sichtbar sein.

Das Bottom Sheet kennt drei Rastpunkte (peek · halb · voll). Ziehen und der Griff schalten
wie gehabt; ein Tipp auf die leere Fläche rechts neben den Tabs fährt es ganz aus und aus
dem ausgefahrenen Zustand wieder ganz ein — die zwei Extreme ohne Umweg über „halb".

Ein Statusbalken über der Karte war der erste Entwurf; er kostete rund 56 px Höhe für
eine Aussage, die in eine Farbe passt. Geblieben ist der Ortungsknopf oben rechts: er
ist zugleich Schalter (Ortung an · Zentrieren · GPS nutzen) und Anzeige — grau ohne
Standort, grün im Versteck-Radius, rot ausserhalb. Der ausführliche Text steht im
`title`, Ortungsfehler erscheinen als wegklickbare Einblendung.

Harte Regeln, weil das Ding im Zug mit einer Hand bedient wird:
- `100dvh` statt `100vh`, plus `env(safe-area-inset-*)` — sonst verdeckt die iOS-Leiste die Controls
- Touch-Targets ≥ 44 px, Fließtext ≥ 14 px
- Alle primären Aktionen im unteren Bildschirmdrittel (Daumenzone)
- Dark Mode über `prefers-color-scheme`, Basiskarte passend gewechselt; ein Knopf in der
  rechten Leiste überstimmt das Gerät (`data-theme` auf `<html>`, gemerkt wie die übrigen
  Einstellungen). Die Karten-Overlays holen ihre Farben aus dem CSS und zeichnen nach
  jedem Wechsel neu — egal ob Gerät oder Knopf ihn ausgelöst hat
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

V1, V2, V4 und V5 sind umgesetzt und headless gegen den echten Datenstand gegengeprüft:
Kartenvorschau je Frage-Typ (Orte, hervorgehobener nächster, Linie samt Entfernung) sowie
der Link-Rundlauf über Sende- und Empfangsweg im DOM.

- 459 Halte (63 Bahn, 29 Metro, 52 Tram, 300 Bus, 15 Fähre), davon 16 nur gegen Aufpreis;
  alle liegen im Spielgebiet
- 2006 Orte in 11 Kategorien
- 69 Fragekarten, 35 davon auf der Karte zeichenbar, 3 automatisch als schwach erkannt

### Beim Bauen aufgefallen

- Ein Welt-Ring bis ±90° Breite lässt sich in Web-Mercator nicht projizieren; das
  Spielgebiet-Overlay wurde dadurch gar nicht gezeichnet. Grenze ist ±85,05°.
- Leaflet stapelt Marker nach Breitengrad, nicht nach Einfügereihenfolge. Der
  hervorgehobene Ort verschwand dadurch mitten in der Innenstadt unter den anderen; es
  braucht einen `zIndexOffset`.
- `L.circle(...).getBounds()` funktioniert nur, wenn das Circle an einer Karte hängt —
  sonst kommen NaN-Bounds heraus. `L.latLng(...).toBounds(meter)` rechnet kartenunabhängig.
- Leaflets `flyToBounds` hat die Karte im Test nicht bewegt, `fitBounds` schon.
- `fitBounds` auf einen einzelnen Punkt ergibt ein leeres Rechteck und damit die höchste
  Zoomstufe — bei Matching und Measuring war danach von der Geometrie nichts mehr zu
  sehen. Ohne Radius spannt dort der nächstgelegene Ort den Ausschnitt auf, mit einer
  Untergrenze für den Fall, dass er zweihundert Meter weiter steht.
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
- Das Bottom Sheet liegt mit `z-index: 700` über allem. Ein Overlay, das aus ihm heraus
  aufgerufen wird, muss es einklappen — sonst erscheint es hinter der Liste, aus der man
  es gerade geöffnet hat.
- `history.replaceState` löst kein `hashchange` aus. Deshalb kann das Fragment nach dem
  Lesen gefahrlos geleert werden, ohne dass sich der Link selbst noch einmal auslöst.
- Permanente Leaflet-Tooltips erscheinen auch an Linien mit `interactive: false` — genau
  das, was eine Streckenbeschriftung braucht, die nicht angeklickt werden soll.
- Der frei wählbare Radar-Radius steckt in der Fragenliste und galt versehentlich auch
  für Karten ohne Radius. Im Link stand dann `r=3000` an einer Photos-Karte, und beim
  Einpassen zog die Karte den Ausschnitt auf die 3 km des Reglers statt auf den
  nächstgelegenen Ort — beim Zeichnen fiel es nicht auf, weil Matching und Measuring
  keinen Radius benutzen.
- `watchPosition` liefert im Sekundentakt. Solange eine erhaltene Frage offen ist, hängt
  daran ein Neuzeichnen — bei Matching und Measuring bis zu 60 Marker. Unter 20 m Bewegung
  wird deshalb nicht neu gezeichnet; das ist feiner, als die Entfernungsangabe auflöst.
