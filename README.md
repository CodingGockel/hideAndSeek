# Hide & Seek — Amsterdam

Spielkarte für ein Hide-and-Seek-Spiel nach dem Vorbild von *Jet Lag: The Game*.
Zeigt das Spielgebiet, alle bespielbaren Haltestellen und den 800-m-Radius, innerhalb
dessen man sich an einer Haltestelle verstecken darf.

Client-only, mobile-first, kein Server. Der Entwurf steht in [SPEC.md](SPEC.md).

## Was die App kann

- Vollbild-Karte mit dem Spielgebiet als Overlay
- Alle 459 bespielbaren Halte der Region — Bahn, Metro, Tram, Bus und Fähre —,
  filterbar nach Verkehrsmittel
- **Versteck-Radius**: 800 m um den gewählten Halt, einzeln oder für alle auf einmal
- **Gültigkeitsprüfung**: „Gültiges Versteck — 300 m von Amsterdam Zuid" anhand des
  eigenen Standorts. Das ist die Frage, die man unterwegs tatsächlich hat.
- **Standort von Hand setzen**: „Standort setzen" antippen, dann auf die Karte tippen.
  Der Punkt lässt sich anschliessend verschieben und ersetzt die Ortung, bis „GPS nutzen"
  gedrückt wird — praktisch zum Planen zu Hause und wenn das GPS im Zug daneben liegt.
  Er überlebt einen Neustart.
- Haltestellenliste nach Entfernung sortiert, mit Suche
- Halte ausserhalb des Ticketgebiets (Utrecht, Alkmaar, Hilversum …) sind als
  „Aufpreis" markiert — bespielbar, aber die Fahrt dorthin kostet extra
- **Drei Basiskarten** zum Umschalten: Standard, ÖPNV-Karte (zeigt die Linien) und Satellit
- Marker mit Piktogramm des Verkehrsmittels; Umsteigeknoten wie Amsterdam Zuid tragen
  einen zweiten Ring in der Farbe der zweiten Linie
- **Fragenliste** mit allen 69 Fragekarten, durchsuchbar und einzeln abhakbar
- **Fragen auf der Karte**: 38 der 69 Karten lassen sich zeichnen, beliebig viele
  gleichzeitig und in eigenen Farben
- **Fragen verschicken**: ein Knopf je Karte baut die WhatsApp-Nachricht samt eigener
  Koordinaten und einem Link, der die Frage beim Empfänger wieder aufmacht — mit
  gestrichelten Vergleichslinien zu seinem eigenen Standort
- **Sucher-Standort eintragen**: die Koordinaten aus dem Chat in den Knopf „Sucher"
  tippen — danach zeichnet jede Frage sich um diesen Punkt, mit der Entfernung von dir
  zu dem, was die Antwort entscheidet

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

Das **Karten-Icon** legt die Geometrie der Frage auf die Karte: worüber die Frage redet,
nicht was die Antwort ist. Die Karte zoomt passend, das Sheet klappt halb ein. Ein
zweites Antippen nimmt sie wieder weg, ein Antippen an einer anderen Karte ersetzt sie —
es liegt immer höchstens eine da. Beim frei wählbaren Radar-Radius wächst der Kreis beim
Tippen mit.

Beantwortet wird im Chat, nicht in der App: die Antwort steht ohnehin dort, und ein
zweiter Zustand neben dem Häkchen wäre unterwegs nur Buchhaltung. Die App zeigt deshalb
zwei Farben — alles Neutrale grau, und in Blau genau das, was die Frage entscheidet: den
nächstgelegenen Ort und eine gestrichelte Linie mit der Entfernung dorthin.

| Kategorie | Darstellung |
|---|---|
| Radar | gestrichelter Kreis um den Fragepunkt |
| Tentacles | Kreis plus alle Orte der Kategorie darin, je mit Piktogramm (Museum, Zoo, Kino …), der nächstgelegene hervorgehoben |
| Matching | die Orte in der Nähe (bis zu 60), der nächstgelegene hervorgehoben |
| Measuring | dasselbe Bild wie Matching: die Frage ist eine andere, aber zu beantworten ist sie nur über die Orte und den eigenen nächsten |
| Thermometer · Photos | nicht zeichenbar, nur abhakbar |

Fragen, die mit den vorhandenen Daten kaum etwas aussagen, sind als **schwach** markiert —
etwa „gleicher nächster Flughafen?" (es gibt nur Schiphol, die Antwort ist immer ja) oder
„gleicher nächster Park?" (über tausend Parks, die Antwort ist fast immer nein).

Radar- und Thermometer-Werte sind metrisch und auf euer Gebiet zugeschnitten (500 m bis
40 km) statt der Original-Meilen bis 161 km, die bei 45 × 40 km Spielgebiet nichts mehr
ausschliessen.

### Eine Frage verschicken

Der Papierflieger neben einer Karte öffnet die fertige Nachricht:

```
Team Rot fragt — Radar
Bist du im Umkreis von 2 km um mich?
Mein Standort: 52.37897, 4.90042
https://www.google.com/maps?q=52.37897,4.90042
In der App beantworten: https://…/#v=1&q=radar%3A2-km&o=52.37897%2C4.90042&r=2000&n=Team+Rot
```

„WhatsApp" öffnet die Chat-Auswahl mit vorbefülltem Text, „Kopieren" legt ihn in die
Zwischenablage; beides hakt die Karte gleich als genutzt ab. Der Absendername wird einmal
eingetragen und gemerkt — nützlich, wenn mehrere Sucher-Teams in dieselbe Gruppe
schreiben. Ohne Ortung wird die Kartenmitte verschickt, und die App sagt das auch.

Der Knopf sitzt an **jeder** Karte, auch an den nicht zeichenbaren: gerade die
Photos-Karten müssen verschickt werden.

### Eine Frage beantworten

Wer den Link antippt, landet in der App bei der Frage: der Standort des Fragenden liegt
als fester Punkt A auf der Karte, dazu seine Geometrie — und **von der eigenen Position
eine gestrichelte Linie mit Entfernung zu jedem Punkt, der die Antwort entscheidet**.
Bei Radar ist das der Fragende selbst, bei Matching und Measuring der jeweils nächste
Ort auf beiden Seiten, bei Tentacles der nächste Ort im Kreis — dessen Name steht
zusätzlich im Klartext da, denn er *ist* die Antwort.

Geantwortet wird im Chat; die App zeigt nur, was zur Antwort nötig ist.

### Ohne Link: den Sucher-Standort eintragen

Meist schicken die Sucher nur ihre Koordinaten in die Gruppe. Der Knopf **„Sucher"** auf
der Karte nimmt sie entgegen — `52.37897, 4.90042`, Komma oder Leerzeichen dazwischen.
Der Punkt erscheint als Ring auf der Karte, bleibt bis zum nächsten Ändern liegen und
überlebt einen Neustart.

Danach zeigt das Karten-Icon jeder Frage dasselbe Bild wie ein erhaltener Link:
Geometrie um den Sucher, dazu von deiner Position die gestrichelten Linien mit der
Entfernung. „Entfernen" schaltet zurück — dann zeichnet das Karten-Icon wieder um deinen
eigenen Standort, wie beim Planen einer eigenen Frage.

Thermometer-Karten lassen sich verschicken, aber nicht zeichnen: die Mittelsenkrechte
bräuchte Start- *und* Zielpunkt, verschickt wird nur der aktuelle. Woher der Sucher
losgefahren ist, steht in der Nachricht davor.

## Stationsdaten pflegen

```bash
npm run data            # alles neu erzeugen
npm run data:stations   # Haltestellen aus data/artt_verstecke.geojson
npm run data:area       # Spielgebiet aus der Haltestellenliste
npm run data:pois       # Orte für die Fragekarten (~2000 Objekte)
npm run data:questions  # Fragekarten mit Zeichen-Metadaten
```

`data:questions` liest `jetlag_questions_medium.json` im Projektwurzelverzeichnis und
braucht `poi.json` und `stations.json`, um die schwachen Fragen zu erkennen — also nach
den beiden anderen laufen lassen (`npm run data` macht das in der richtigen Reihenfolge).

Quelle der Halte ist `data/artt_verstecke.geojson` — die kuratierte Liste aller mit dem
Amsterdam & Region Travel Ticket erreichbaren Halte (Bahn, Metro und Fähre vollständig,
Bus und Tram auf 650 m Abstand ausgedünnt, mit den bedienenden Linien). Wer die Liste
ändern will, ändert diese Datei und lässt `npm run data:stations && npm run data:area`
laufen.

`public/data/stations.json` wird zur Laufzeit geladen und kann **direkt editiert werden,
ohne neu zu bauen**. Alle Halte der Quelle sind bespielbar. Soll einer doch nicht dabei
sein, `ticketValid: false` setzen — er verschwindet dann aus Karte und Liste.

`ticketValid` und `notes` überleben ein erneutes `npm run data`; die vorhandene Datei
wird gemerged, nicht überschrieben.

Nach dem Bearbeiten `npm run data:area` laufen lassen, damit das Spielgebiet zur
Haltestellenliste passt. Alle bespielbaren Halte zählen dafür, auch die mit `extraCost`.

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
src/stores/questions.ts Fragekarten, Häkchen, Kartenvorschau
src/lib/share.ts        Nachrichtentext, Link-Schema, deutsche Fragesätze
```

`config.json` enthält den Versteck-Radius, den Kartenausschnitt, die Liste der Basiskarten
und die Farben pro Verkehrsmittel — ebenfalls ohne Rebuild änderbar. Eine weitere Basiskarte
ist ein Eintrag mehr in `basemaps`; `photo: true` nimmt sie vom Dark-Mode-Filter aus.

Karten von [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL), Stationsdaten
ebenfalls aus OSM.
