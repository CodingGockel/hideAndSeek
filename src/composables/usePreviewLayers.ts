/**
 * Zeichnet die Frage, über die gerade geredet wird.
 *
 * Es liegt immer höchstens eine Geometrie auf der Karte, und sie behauptet nichts:
 * gezeigt wird, worüber die Frage redet — der Umkreis, die Orte, der nächstgelegene.
 * Die Antwort zieht der Spieler und schickt sie über den Chat; in der App bleibt davon
 * nur das Häkchen „genutzt".
 *
 * Deshalb gibt es auch nur zwei Farben: alles Neutrale in `--preview`, und in `--accent`
 * genau das, was die Frage entscheidet — der nächstgelegene Ort und die Linie dorthin.
 */

import { watch, type Ref } from 'vue'
import L from 'leaflet'
import { useQuestionStore } from '../stores/questions'
import { useGameStore } from '../stores/game'
import { distanceMeters, formatDistance, nearest } from '../lib/geo'
import { SHEET_HALF_RATIO } from '../lib/layout'
import { cssColor, resolvedTheme } from '../lib/theme'
import type { LatLon, MapPreview } from '../types/game'

/**
 * Eigene Ebene für den Ankerpunkt, über dem Standortpunkt (z-index 650). Der Fragepunkt
 * liegt in der Regel genau auf der eigenen Position — ohne das verschwindet er darunter.
 */
const ANCHOR_PANE = 'preview-anchor'

/**
 * Wie viele Orte einer Kategorie höchstens einzeln gezeigt werden. „Park" hat über
 * tausend Einträge in der Region — als Marker wäre das eine unlesbare Fläche, und
 * für die Frage zählt ohnehin nur die nähere Umgebung.
 */
const MAX_POI_MARKERS = 60

/**
 * Piktogramme der Ortskategorien, im 24er-Raster und geschlossen gezeichnet: bei
 * rund 14 px Kantenlänge überlebt nur eine kräftige Silhouette.
 */
const POI_GLYPHS: Record<string, string> = {
  // Giebel über drei Säulen
  museum: 'M12 2 1 8v2h22V8zM4 12h2.6v6H4zm6.7 0h2.6v6h-2.6zM17.4 12H20v6h-2.6zM2 20h20v2H2z',
  // Aufgeschlagenes Buch
  library:
    'M12 6.6C10.3 5.3 7.9 4.6 5 4.6c-1 0-2 .1-3 .3v13.4c1-.2 2-.3 3-.3 2.9 0 5.3.7 7 2 1.7-1.3 4.1-2 7-2 1 0 2 .1 3 .3V4.9c-1-.2-2-.3-3-.3-2.9 0-5.3.7-7 2z',
  // Filmstreifen
  cinema:
    'M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 3v2h2V7zm14 0v2h2V7zM4 11v2h2v-2zm14 0v2h2v-2zM4 15v2h2v-2zm14 0v2h2v-2zM8 7v10h8V7z',
  // Medizinisches Kreuz
  hospital: 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z',
  // Nadelbaum
  park: 'M12 2 5.5 11H9l-4 6h6v5h2v-5h6l-4-6h3.5z',
  // Tierpfote: Ballen und drei Zehen. Vier Zehen zerfallen bei 14 px zu Rauschen.
  zoo: 'M12 12.4c2.9 0 5.3 2 5.3 4.5 0 1.7-1.3 3.1-3 3.1-1.1 0-1.8-.5-2.3-.5s-1.2.5-2.3.5c-1.7 0-3-1.4-3-3.1 0-2.5 2.4-4.5 5.3-4.5zM5.2 5.8c1.7 0 3.1 1.7 3.1 3.8s-1.4 3.8-3.1 3.8S2.1 11.7 2.1 9.6s1.4-3.8 3.1-3.8zm13.6 0c1.7 0 3.1 1.7 3.1 3.8s-1.4 3.8-3.1 3.8-3.1-1.7-3.1-3.8 1.4-3.8 3.1-3.8zM12 2.5c1.8 0 3.2 1.8 3.2 4s-1.4 4-3.2 4-3.2-1.8-3.2-4 1.4-4 3.2-4z',
  // Fahne am Loch
  golf_course: 'M7 2h2v20H7zm2 .8 11 4-11 4z',
  // Riesenrad
  theme_park:
    'M12 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-1 2.1V10H5.4A7 7 0 0 1 11 4.1zm2 0A7 7 0 0 1 18.6 10H13zM5.4 12H11v5.9A7 7 0 0 1 5.4 12zm7.6 5.9V12h5.6a7 7 0 0 1-5.6 5.9zM8 21h8v2H8z',
  // Globus. Eine Flagge wäre vom Golfplatz-Symbol nicht zu unterscheiden.
  consulate:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.2c1.2 0 2.5 2.2 3 5.8H9c.5-3.6 1.8-5.8 3-5.8zM6.8 10H4.5a7.9 7.9 0 0 1 3.3-4.4A16 16 0 0 0 6.8 10zm0 4c.1 1.6.4 3.1.9 4.4A7.9 7.9 0 0 1 4.5 14zM9 14h6c-.5 3.6-1.8 5.8-3 5.8S9.5 17.6 9 14zm8.2 0h2.3a7.9 7.9 0 0 1-3.2 4.4c.5-1.3.8-2.8.9-4.4zm0-4a16 16 0 0 0-1-4.4A7.9 7.9 0 0 1 19.5 10z',
  // Flugzeug
  airport:
    'M21.5 15.5v-2l-8-5V3a1.5 1.5 0 0 0-3 0v5.5l-8 5v2l8-2.4V19l-2.2 1.6V22l3.7-1 3.7 1v-1.4L13.5 19v-5.9z',
  // Fisch. Der Schwanz braucht spürbar Breite, sonst bleibt optisch nur ein Auge übrig.
  aquarium:
    'M22 12c-1.9 3.3-5.4 5.6-9.2 5.6-2.5 0-4.8-.9-6.4-2.5L2 19.5v-15l4.4 4.4C8 7.3 10.3 6.4 12.8 6.4c3.8 0 7.3 2.3 9.2 5.6zm-5.6-1.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z',
  // Bahnhof — für „Rail Station", das nicht aus poi.json kommt
  station:
    'M12 2c-4 0-7 .5-7 4v8.5A2.5 2.5 0 0 0 7.5 17L6 19.5v.5h2l1.5-2h5l1.5 2h2v-.5L16.5 17a2.5 2.5 0 0 0 2.5-2.5V6c0-3.5-3-4-7-4zM7.5 7h9v4.5h-9zm2 6.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm5 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z',
}

/** Punkt als Rückfall, wenn eine Kategorie kein eigenes Zeichen hat. */
const POI_FALLBACK_GLYPH = 'M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z'

export function usePreviewLayers(map: Ref<L.Map | null>, renderer: Ref<L.Canvas | null>) {
  const store = useQuestionStore()
  const game = useGameStore()

  let group: L.LayerGroup | null = null

  /** Alles Neutrale — Kreis, Orte, Ankerpunkt. Folgt dem Farbschema. */
  function neutral() {
    return cssColor('--preview', '#1e293b')
  }

  /** Was die Frage entscheidet: der nächstgelegene Ort und die Linie dorthin. */
  function accent() {
    return cssColor('--accent', '#2563eb')
  }

  /**
   * Der Punkt, von dem aus gefragt wird.
   *
   * Fest, nicht verschiebbar: er ist entweder die eigene Position oder — bei einer per
   * Link erhaltenen Frage — der Standort des Fragenden, eine Tatsache aus der Nachricht.
   * Zu verschieben gäbe es hier nichts, was länger als bis zum nächsten Neuzeichnen hielte.
   */
  function anchorMarker(preview: MapPreview) {
    const who = preview.senderName?.trim()

    return L.marker([preview.origin.lat, preview.origin.lon], {
      pane: ANCHOR_PANE,
      keyboard: false,
      icon: L.divIcon({
        className: 'preview-anchor-host',
        html: `<span class="preview-anchor" style="--c:${neutral()}"></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    }).bindTooltip(
      preview.compareToUser ? `Standort von ${who || 'den Suchern'}` : `${preview.label} — Fragepunkt`,
      { direction: 'top', offset: [0, -9] },
    )
  }

  function drawRadius(preview: MapPreview, layers: L.Layer[]) {
    const radius = preview.radiusMeters
    if (!radius) return

    const color = neutral()
    layers.push(
      L.circle([preview.origin.lat, preview.origin.lon], {
        renderer: renderer.value ?? undefined,
        radius,
        color,
        weight: 3,
        opacity: 0.95,
        // Gestrichelt und nur leicht gefüllt: der Kreis zeigt die Grösse des Umkreises,
        // nicht das Ergebnis — das steht im Chat.
        dashArray: '7,5',
        fillColor: color,
        fillOpacity: 0.16,
        interactive: false,
      }),
    )
    layers.push(anchorMarker(preview))
  }

  /**
   * Die Orte, auf die sich eine Frage bezieht. „Rail Station" steht nicht in
   * poi.json — dafür gibt es die Stationsliste, die ohnehin geladen ist. Gemeint
   * sind dabei nur Bahnhöfe, nicht jede Bushaltestelle, und unabhängig davon,
   * welche Verkehrsmittel gerade eingeblendet sind.
   */
  function poisFor(preview: MapPreview) {
    if (!preview.poiCategory) return []
    if (preview.poiCategory === 'station') {
      return game.railStations.map((s) => ({
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        category: 'station',
      }))
    }
    return store.poisByCategory.get(preview.poiCategory) ?? []
  }

  /**
   * Ein Ort als Piktogramm seiner Kategorie. Der nächstgelegene wird grösser, in der
   * Akzentfarbe und mit Ring gezeigt: er ist der Ort, um den es in der Frage geht.
   */
  function poiMarker(
    poi: { name: string; lat: number; lon: number; category?: string },
    highlighted: boolean,
  ) {
    const size = highlighted ? 30 : 22
    const glyph = POI_GLYPHS[poi.category ?? ''] ?? POI_FALLBACK_GLYPH
    const classes = highlighted ? 'poi-pin is-nearest' : 'poi-pin'

    return L.marker([poi.lat, poi.lon], {
      keyboard: false,
      // Leaflet stapelt Marker nach Breitengrad. In der Innenstadt liegen bis zu 60
      // Orte übereinander — ohne Vorrang verschwindet ausgerechnet der hervorgehobene
      // darunter.
      zIndexOffset: highlighted ? 1000 : 0,
      icon: L.divIcon({
        className: 'poi-pin-host',
        html:
          `<span class="${classes}" style="--c:${highlighted ? accent() : neutral()}">` +
          `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${glyph}"/></svg>` +
          `</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    }).bindTooltip(poi.name, { direction: 'top', offset: [0, -size / 2 - 2] })
  }

  /**
   * Gestrichelte Linie vom Fragepunkt zu dem Ort, der von dort der nächste ist —
   * beschriftet mit der Entfernung. Sie ist bei Matching, Measuring und Tentacles die
   * eigentliche Aussage der Karte: welcher Ort es ist und wie weit er weg liegt.
   *
   * Bei einer erhaltenen Frage gehört sie jemand anderem und bleibt deshalb neutral —
   * die Akzentfarbe ist dort für die eigene Vergleichslinie reserviert, sonst wären die
   * beiden Linien nicht auseinanderzuhalten.
   */
  function originLine(preview: MapPreview, to: { lat: number; lon: number }) {
    return L.polyline(
      [
        [preview.origin.lat, preview.origin.lon],
        [to.lat, to.lon],
      ],
      {
        color: preview.compareToUser ? neutral() : accent(),
        weight: 2,
        opacity: 0.9,
        dashArray: '6,6',
        interactive: false,
      },
    ).bindTooltip(formatDistance(distanceMeters(preview.origin, to)), {
      permanent: true,
      direction: 'center',
      className: 'distance-label',
    })
  }

  /**
   * Tentacles: Kreis um den Fragepunkt, die Orte darin, und der nächstgelegene davon
   * hervorgehoben. Gefragt ist nach dem nächsten Ort *im Kreis* — die Orte ausserhalb
   * zählen für die Antwort nicht und werden deshalb auch nicht gezeigt.
   */
  function drawPoiWithin(preview: MapPreview, layers: L.Layer[]) {
    const radius = preview.radiusMeters
    if (!radius) return

    layers.push(
      L.circle([preview.origin.lat, preview.origin.lon], {
        renderer: renderer.value ?? undefined,
        radius,
        color: neutral(),
        weight: 3,
        opacity: 0.95,
        dashArray: '7,5',
        fillColor: neutral(),
        fillOpacity: 0.14,
        interactive: false,
      }),
    )

    const inside = poisFor(preview).filter((poi) => distanceMeters(preview.origin, poi) <= radius)
    const closest = nearest(preview.origin, inside)

    for (const poi of inside) {
      if (poi === closest?.item) continue
      layers.push(poiMarker(poi, false))
    }
    if (closest) {
      layers.push(poiMarker(closest.item, true))
      layers.push(originLine(preview, closest.item))
    }

    layers.push(anchorMarker(preview))
  }

  /**
   * Matching und Measuring: die Orte der Kategorie, der nächstgelegene hervorgehoben,
   * eine beschriftete Linie dorthin.
   *
   * Beide Kartentypen zeigen dasselbe Bild. Sie fragen zwar Verschiedenes — Matching
   * nach der Identität des nächsten Orts, Measuring nach dem Abstand zu ihm — aber
   * beantworten lässt sich beides nur, indem man die Orte und den eigenen nächsten
   * sieht. Measuring zeichnete früher stattdessen die Isodistanz-Fläche; die färbte
   * eine Antwort ein, die es nicht mehr gibt, und liess die Orte selbst weg.
   */
  function drawPoiNearest(preview: MapPreview, layers: L.Layer[]) {
    const pois = poisFor(preview)
    const closest = nearest(preview.origin, pois)
    if (!closest) return

    // Nach Entfernung sortiert kappen: was weit weg liegt, sagt zu dieser Frage nichts.
    const shown = [...pois]
      .sort((a, b) => distanceMeters(preview.origin, a) - distanceMeters(preview.origin, b))
      .slice(0, MAX_POI_MARKERS)

    for (const poi of shown) {
      if (poi === closest.item) continue
      layers.push(poiMarker(poi, false))
    }
    layers.push(poiMarker(closest.item, true))

    layers.push(originLine(preview, closest.item))
    layers.push(anchorMarker(preview))
  }

  /**
   * Vergleichslinien zur eigenen Position, wenn die Frage von jemand anderem kam.
   *
   * Eine Regel für alle Kartentypen: von dort, wo ich stehe, eine gestrichelte Linie zu
   * jedem Punkt, der die Antwort entscheidet, beschriftet mit der Entfernung. Damit ist
   * „bist du im Umkreis von 2 km?" oder „ist dein nächstes Museum meins?" abzulesen,
   * ohne dass die App die Antwort behauptet — geantwortet wird weiterhin im Chat.
   */
  function drawComparison(preview: MapPreview, layers: L.Layer[]) {
    const position = game.userPosition
    if (!position) return
    const me: LatLon = { lat: position.lat, lon: position.lon }

    if (preview.viz === 'radius') {
      layers.push(compareLine(me, preview.origin))
      return
    }

    const pois = poisFor(preview)
    const radius = preview.radiusMeters

    // Tentacles fragt nach dem nächsten Ort *im Kreis des Fragenden* — die Orte
    // ausserhalb zählen für die Antwort nicht.
    const candidates =
      preview.viz === 'poi-within' && radius
        ? pois.filter((poi) => distanceMeters(preview.origin, poi) <= radius)
        : pois

    const mine = nearest(me, candidates)
    if (!mine) return

    // Der nächste Ort des Fragenden ist schon hervorgehoben; ist es derselbe, reicht ein
    // Marker — die zwei Linien darauf sind die Aussage. Meiner kann ausserhalb der
    // gezeigten MAX_POI_MARKERS liegen, deshalb explizit.
    const alreadyShown = nearest(preview.origin, candidates)?.item ?? null
    if (mine.item !== alreadyShown) layers.push(poiMarker(mine.item, true))

    layers.push(compareLine(me, mine.item))
  }

  /** Gestrichelte Linie von der eigenen Position, mit der Entfernung als Etikett. */
  function compareLine(from: LatLon, to: { lat: number; lon: number }) {
    return L.polyline(
      [
        [from.lat, from.lon],
        [to.lat, to.lon],
      ],
      {
        color: accent(),
        weight: 2,
        opacity: 0.95,
        dashArray: '6,6',
        interactive: false,
      },
    ).bindTooltip(formatDistance(distanceMeters(from, to)), {
      permanent: true,
      direction: 'center',
      className: 'distance-label',
    })
  }

  function draw() {
    if (!map.value) return
    group?.remove()
    group = null

    const preview = store.preview
    if (preview) {
      const layers: L.Layer[] = []

      if (preview.viz === 'radius') drawRadius(preview, layers)
      else if (preview.viz === 'poi-within') drawPoiWithin(preview, layers)
      else drawPoiNearest(preview, layers)

      if (preview.compareToUser) drawComparison(preview, layers)

      if (layers.length) group = L.layerGroup(layers).addTo(map.value)
    }

    const position = game.userPosition
    lastDrawnPosition = position ? { lat: position.lat, lon: position.lon } : null
  }

  watch(() => store.preview, draw, { deep: true })

  // Auch die Vorschau holt ihre Farben aus dem CSS — nach einem Wechsel neu zeichnen.
  watch(resolvedTheme, draw)

  /**
   * Die Vergleichslinien einer erhaltenen Frage folgen dem GPS — aber nicht jedem Zucken.
   *
   * `watchPosition` liefert im Sekundentakt, und ein Neuzeichnen hängt bei Matching und
   * Measuring an bis zu 60 Markern. Unter 20 m ändert sich an der Aussage ohnehin nichts;
   * das ist auch weniger, als die Entfernungsangabe auflöst.
   */
  const REDRAW_THRESHOLD_METERS = 20
  let lastDrawnPosition: LatLon | null = null

  watch(
    () => game.userPosition,
    (position) => {
      if (!store.preview?.compareToUser || !position) return
      if (
        lastDrawnPosition &&
        distanceMeters(lastDrawnPosition, position) < REDRAW_THRESHOLD_METERS
      ) {
        return
      }
      lastDrawnPosition = { lat: position.lat, lon: position.lon }
      draw()
    },
  )

  function bind() {
    if (!map.value) return
    map.value.createPane(ANCHOR_PANE).style.zIndex = '660'
    draw()
  }

  /** Karte auf die Vorschau ziehen. */
  function focusPreview() {
    const preview = store.preview
    if (!preview || !map.value) return

    const origin = L.latLng(preview.origin.lat, preview.origin.lon)

    // Ein Radius gibt den Ausschnitt vor. Ohne ihn (Matching, Measuring) spannt der
    // nächstgelegene Ort ihn auf: die Linie dorthin ist die Aussage der Karte und muss
    // ins Bild passen. Ein einzelner Punkt allein ergäbe ein leeres Rechteck und damit
    // die höchste Zoomstufe; die Untergrenze hält den Ausschnitt auch dann brauchbar,
    // wenn der Ort zweihundert Meter weiter steht.
    const MIN_EXTENT = 1200
    const FALLBACK_EXTENT = 8000

    let extent = preview.radiusMeters ?? null
    if (!extent) {
      const closest = nearest(preview.origin, poisFor(preview))
      extent = closest ? Math.max(closest.distance * 1.4, MIN_EXTENT) : FALLBACK_EXTENT
    }

    const bounds = origin.toBounds(extent * 2)

    // Bei einer fremden Frage gehört die eigene Position zum Bild: die Linie dorthin ist
    // die halbe Aussage. Steht der Fragende ein paar Kilometer weiter, liefe sie sonst
    // aus dem Ausschnitt heraus.
    const position = game.userPosition
    if (preview.compareToUser && position) bounds.extend([position.lat, position.lon])

    // Das Sheet verdeckt den unteren Teil der Karte; ohne den Zuschlag läge die
    // Geometrie genau dahinter.
    map.value.fitBounds(bounds, {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, Math.round(window.innerHeight * SHEET_HALF_RATIO)],
      maxZoom: 15,
    })
  }

  return { bind, draw, focusPreview }
}
