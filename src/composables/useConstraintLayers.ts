import { watch, type Ref } from 'vue'
import L from 'leaflet'
import { useQuestionStore } from '../stores/questions'
import { useGameStore } from '../stores/game'
import { bisectorLine, distanceMeters, formatDistance, halfPlanePolygon, nearest } from '../lib/geo'
import { SHEET_HALF_RATIO } from '../lib/layout'
import { cssColor } from '../lib/theme'
import type { Constraint, LatLon } from '../types/game'

/**
 * Zeichnet die beantworteten Fragen als Geometrie.
 *
 * Da Stationen bewusst nicht automatisch ausgeschlossen werden, muss die
 * Überlagerung mehrerer Einschränkungen die Arbeit tun: drei Kreise und eine
 * Halbebene übereinander zeigen den Bereich, der übrig bleibt. Deshalb liegen
 * alle sichtbaren Einschränkungen gleichzeitig auf der Karte, jede in eigener
 * Farbe.
 *
 * Zwei Antwortarten, zwei Darstellungen:
 * - „hier drin" wird in der Farbe der Einschränkung ausgefüllt
 * - „hier nicht drin" wird abgedunkelt, wie schon der Bereich ausserhalb des
 *   Spielgebiets — das Auge liest beides als „hier nicht"
 */
const EXCLUDED_FILL = 'rgb(15 23 42 / 0.35)'

/**
 * Eigene Ebene für die Griffe, über dem Standortpunkt (z-index 650). Der erste
 * Fragepunkt liegt genau auf der eigenen Position — ohne das verschwindet sein
 * Griff darunter und lässt sich nicht mehr finden.
 */
const HANDLE_PANE = 'constraint-handles'

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

/** Antworten, die den Bereich einschliessen statt ihn auszuschliessen. */
const INCLUSIVE = new Set(['yes', 'closer', 'hotter'])

export function useConstraintLayers(map: Ref<L.Map | null>, renderer: Ref<L.Canvas | null>) {
  const store = useQuestionStore()
  const game = useGameStore()

  let group: L.LayerGroup | null = null

  /** Farbe einer Einschränkung — die Vorschau folgt dem Farbschema statt der Palette. */
  function colorOf(constraint: Constraint) {
    return constraint.preview ? cssColor('--preview', '#1e293b') : constraint.color
  }

  function isInclusive(constraint: Constraint) {
    // Die Vorschau hat noch keine Antwort. Sie zeigt die eingeschlossene Form —
    // abgedunkelt zu beginnen würde eine Aussage vortäuschen, die noch aussteht.
    if (constraint.preview) return true
    return INCLUSIVE.has(constraint.answer)
  }

  /**
   * Verschiebbarer Griff für Bezugs- und Zielpunkt.
   *
   * Bei einer per Link erhaltenen Frage bleibt er fest: der Standort des Fragenden ist
   * eine Tatsache aus der Nachricht, kein Regler. (Verschieben ginge dort ohnehin ins
   * Leere — `setConstraintPoint` läuft über die gespeicherten Einschränkungen, die
   * Vorschau ist keine davon, der Griff spränge beim Neuzeichnen zurück.)
   */
  function handleFor(constraint: Constraint, which: 'origin' | 'target', point: L.LatLngExpression) {
    const foreign = constraint.compareToUser === true
    const who = constraint.senderName?.trim()

    const marker = L.marker(point, {
      pane: HANDLE_PANE,
      draggable: !foreign,
      keyboard: false,
      icon: L.divIcon({
        className: 'constraint-handle-host',
        html: `<span class="constraint-handle" style="--c:${colorOf(constraint)}">${which === 'origin' ? 'A' : 'B'}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).bindTooltip(
      foreign
        ? `Standort von ${who || 'den Suchern'}`
        : which === 'origin'
          ? `${constraint.label} — Fragepunkt`
          : `${constraint.label} — Zielpunkt`,
      { direction: 'top', offset: [0, -12] },
    )

    if (foreign) return marker

    return marker.on('dragend', (event) => {
      const { lat, lng } = (event.target as L.Marker).getLatLng()
      store.setConstraintPoint(constraint.id, which, { lat, lon: lng })
    })
  }

  function drawRadius(constraint: Constraint, layers: L.Layer[]) {
    const radius = constraint.radiusMeters
    if (!radius) return

    const inclusive = isInclusive(constraint)
    const color = colorOf(constraint)
    layers.push(
      L.circle([constraint.origin.lat, constraint.origin.lon], {
        renderer: renderer.value ?? undefined,
        radius,
        color,
        weight: constraint.preview ? 3 : 2,
        opacity: 0.95,
        // Gestrichelt heisst „hier nicht" — auch ohne Farbwahrnehmung unterscheidbar.
        // Die Vorschau ist ebenfalls gestrichelt, aber in neutralem Grau und ohne
        // Abdunkelung: sie zeigt die Grösse, noch keine Aussage.
        dashArray: inclusive && !constraint.preview ? undefined : '7,5',
        fillColor: inclusive ? color : EXCLUDED_FILL,
        fillOpacity: constraint.preview ? 0.16 : inclusive ? 0.12 : 1,
        interactive: false,
      }),
    )
    layers.push(handleFor(constraint, 'origin', [constraint.origin.lat, constraint.origin.lon]))
  }

  function drawHalfPlane(constraint: Constraint, layers: L.Layer[]) {
    const { origin, target } = constraint
    layers.push(handleFor(constraint, 'origin', [origin.lat, origin.lon]))

    if (!target) return
    layers.push(handleFor(constraint, 'target', [target.lat, target.lon]))

    // Gefahrene Strecke.
    layers.push(
      L.polyline(
        [
          [origin.lat, origin.lon],
          [target.lat, target.lon],
        ],
        { color: constraint.color, weight: 2, opacity: 0.6, dashArray: '4,4', interactive: false },
      ),
    )

    // „Wärmer" heisst: näher am Zielpunkt. Dann scheidet die Seite des
    // Ausgangspunkts aus — und umgekehrt.
    const coldSide = isInclusive(constraint) ? 'a' : 'b'
    const polygon = halfPlanePolygon(origin, target, coldSide)
    if (polygon.length) {
      layers.push(
        L.polygon(
          polygon.map((p) => [p.lat, p.lon] as L.LatLngExpression),
          { stroke: false, fillColor: EXCLUDED_FILL, fillOpacity: 1, interactive: false },
        ),
      )
    }

    const line = bisectorLine(origin, target)
    if (line.length) {
      layers.push(
        L.polyline(
          line.map((p) => [p.lat, p.lon] as L.LatLngExpression),
          { color: constraint.color, weight: 3, opacity: 0.95, interactive: false },
        ),
      )
    }
  }

  /**
   * Die Orte, auf die sich eine Frage bezieht. „Rail Station" steht nicht in
   * poi.json — dafür gibt es die Stationsliste, die ohnehin geladen ist. Gemeint
   * sind dabei nur Bahnhöfe, nicht jede Bushaltestelle, und unabhängig davon,
   * welche Verkehrsmittel gerade eingeblendet sind.
   */
  function poisFor(constraint: Constraint) {
    if (!constraint.poiCategory) return []
    if (constraint.poiCategory === 'station') {
      return game.railStations.map((s) => ({
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        category: 'station',
      }))
    }
    return store.poisByCategory.get(constraint.poiCategory) ?? []
  }

  /**
   * Ein Ort als Piktogramm seiner Kategorie, eingefärbt nach der Einschränkung, zu
   * der er gehört. Der nächstgelegene wird grösser und weiss umrandet gezeigt.
   */
  function poiMarker(
    constraint: Constraint,
    poi: { name: string; lat: number; lon: number; category?: string },
    highlighted: boolean,
  ) {
    const size = highlighted ? 30 : 22
    const glyph = POI_GLYPHS[poi.category ?? ''] ?? POI_FALLBACK_GLYPH
    const classes = highlighted ? 'poi-pin is-nearest' : 'poi-pin'

    return L.marker([poi.lat, poi.lon], {
      keyboard: false,
      icon: L.divIcon({
        className: 'poi-pin-host',
        html:
          `<span class="${classes}" style="--c:${colorOf(constraint)}">` +
          `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${glyph}"/></svg>` +
          `</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    }).bindTooltip(poi.name, { direction: 'top', offset: [0, -size / 2 - 2] })
  }

  /**
   * Linie vom Fragepunkt zu dem Ort, der von dort der nächste ist.
   *
   * Die Entfernung steht nur dran, wenn es etwas zu vergleichen gibt: bei der eigenen
   * Frage ist die Zahl ohne Gegenstück nur Rauschen auf der Karte.
   */
  function originLine(constraint: Constraint, to: { lat: number; lon: number }) {
    const line = L.polyline(
      [
        [constraint.origin.lat, constraint.origin.lon],
        [to.lat, to.lon],
      ],
      {
        color: colorOf(constraint),
        weight: 2,
        opacity: 0.8,
        dashArray: '4,4',
        interactive: false,
      },
    )

    if (constraint.compareToUser) {
      line.bindTooltip(formatDistance(distanceMeters(constraint.origin, to)), {
        permanent: true,
        direction: 'center',
        className: 'distance-label',
      })
    }
    return line
  }

  /** Tentacles: Kreis um den Fragepunkt und die Orte, die darin liegen. */
  function drawPoiWithin(constraint: Constraint, layers: L.Layer[]) {
    const radius = constraint.radiusMeters
    if (!radius) return

    layers.push(
      L.circle([constraint.origin.lat, constraint.origin.lon], {
        renderer: renderer.value ?? undefined,
        radius,
        color: colorOf(constraint),
        weight: constraint.preview ? 3 : 2,
        opacity: 0.95,
        dashArray: constraint.preview ? '7,5' : undefined,
        fillColor: colorOf(constraint),
        fillOpacity: constraint.preview ? 0.14 : 0.08,
        interactive: false,
      }),
    )

    const inside = poisFor(constraint).filter(
      (poi) => distanceMeters(constraint.origin, poi) <= radius,
    )
    for (const poi of inside) layers.push(poiMarker(constraint, poi, false))

    layers.push(handleFor(constraint, 'origin', [constraint.origin.lat, constraint.origin.lon]))
  }

  /** Matching: alle Orte in der Nähe, der eigene nächstgelegene hervorgehoben. */
  function drawPoiNearest(constraint: Constraint, layers: L.Layer[]) {
    const pois = poisFor(constraint)
    const closest = nearest(constraint.origin, pois)
    if (!closest) return

    // Nach Entfernung sortiert kappen: was weit weg liegt, sagt zu dieser Frage nichts.
    const shown = [...pois]
      .sort((a, b) => distanceMeters(constraint.origin, a) - distanceMeters(constraint.origin, b))
      .slice(0, MAX_POI_MARKERS)

    for (const poi of shown) {
      if (poi === closest.item) continue
      layers.push(poiMarker(constraint, poi, false))
    }
    layers.push(poiMarker(constraint, closest.item, true))

    layers.push(originLine(constraint, closest.item))
    layers.push(handleFor(constraint, 'origin', [constraint.origin.lat, constraint.origin.lon]))
  }

  /**
   * Measuring: gleich grosse Kreise um alle Orte der Kategorie, mit dem eigenen
   * Abstand zum nächstgelegenen als Radius.
   *
   * Die Vereinigung dieser Kreise ist exakt der Bereich, von dem aus irgendein Ort
   * näher liegt als vom Fragepunkt — also die Antwort „näher". Bei „weiter" gilt
   * das Gegenteil, dann wird die Vereinigung abgedunkelt.
   */
  function drawPoiIsodistance(constraint: Constraint, layers: L.Layer[]) {
    const pois = poisFor(constraint)
    const closest = nearest(constraint.origin, pois)
    if (!closest || closest.distance === 0) return

    const inclusive = isInclusive(constraint)
    const radius = closest.distance

    for (const poi of pois) {
      layers.push(
        L.circle([poi.lat, poi.lon], {
          renderer: renderer.value ?? undefined,
          radius,
          stroke: false,
          fillColor: inclusive ? colorOf(constraint) : EXCLUDED_FILL,
          fillOpacity: inclusive ? 0.18 : 1,
          interactive: false,
        }),
      )
    }

    layers.push(poiMarker(constraint, closest.item, true))
    layers.push(originLine(constraint, closest.item))
    layers.push(handleFor(constraint, 'origin', [constraint.origin.lat, constraint.origin.lon]))
  }

  /**
   * Vergleichslinien zur eigenen Position, wenn die Frage von jemand anderem kam.
   *
   * Eine Regel für alle Kartentypen: von dort, wo ich stehe, eine gestrichelte Linie zu
   * jedem Punkt, der die Antwort entscheidet, beschriftet mit der Entfernung. Damit ist
   * „bist du im Umkreis von 2 km?" oder „ist dein nächstes Museum meins?" abzulesen,
   * ohne dass die App die Antwort behauptet — geantwortet wird weiterhin im Chat.
   */
  function drawComparison(constraint: Constraint, layers: L.Layer[]) {
    const position = game.userPosition
    if (!position) return
    const me: LatLon = { lat: position.lat, lon: position.lon }

    if (constraint.viz === 'radius') {
      layers.push(compareLine(me, constraint.origin))
      return
    }

    // Thermometer: der Abstand zu beiden Enden der Fahrt ist die Antwort.
    if (constraint.viz === 'halfplane') {
      layers.push(compareLine(me, constraint.origin))
      if (constraint.target) layers.push(compareLine(me, constraint.target))
      return
    }

    const pois = poisFor(constraint)
    const radius = constraint.radiusMeters

    // Tentacles fragt nach dem nächsten Ort *im Kreis des Fragenden* — die Orte
    // ausserhalb zählen für die Antwort nicht.
    const candidates =
      constraint.viz === 'poi-within' && radius
        ? pois.filter((poi) => distanceMeters(constraint.origin, poi) <= radius)
        : pois

    const mine = nearest(me, candidates)
    if (!mine) return

    // Bei Matching und Measuring ist der nächste Ort des Fragenden schon hervorgehoben;
    // ist es derselbe, reicht ein Marker — die zwei Linien darauf sind die Aussage.
    // Meiner kann ausserhalb der gezeigten MAX_POI_MARKERS liegen, deshalb explizit.
    const alreadyShown =
      constraint.viz === 'poi-within' ? null : (nearest(constraint.origin, pois)?.item ?? null)
    if (mine.item !== alreadyShown) layers.push(poiMarker(constraint, mine.item, true))

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
        color: cssColor('--accent', '#2563eb'),
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

    const layers: L.Layer[] = []
    // Die Vorschau liegt zuletzt und damit über den bestätigten Einschränkungen.
    const all = [...store.visibleConstraints, ...(store.preview ? [store.preview] : [])]
    for (const constraint of all) {
      if (constraint.viz === 'radius') drawRadius(constraint, layers)
      else if (constraint.viz === 'halfplane') drawHalfPlane(constraint, layers)
      else if (constraint.viz === 'poi-within') drawPoiWithin(constraint, layers)
      else if (constraint.viz === 'poi-nearest') drawPoiNearest(constraint, layers)
      else if (constraint.viz === 'poi-isodistance') drawPoiIsodistance(constraint, layers)

      if (constraint.compareToUser) drawComparison(constraint, layers)
    }

    if (layers.length) group = L.layerGroup(layers).addTo(map.value)

    const position = game.userPosition
    lastDrawnPosition = position ? { lat: position.lat, lon: position.lon } : null
  }

  watch(() => store.constraints, draw, { deep: true })
  watch(() => store.preview, draw, { deep: true })

  /**
   * Die Vergleichslinien einer erhaltenen Frage folgen dem GPS — aber nicht jedem Zucken.
   *
   * `watchPosition` liefert im Sekundentakt, und ein Neuzeichnen hängt bei Measuring an
   * über tausend Kreisen. Unter 20 m ändert sich an der Aussage ohnehin nichts; das ist
   * auch weniger, als die Entfernungsangabe auflöst.
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
    map.value.createPane(HANDLE_PANE).style.zIndex = '660'
    draw()
  }

  /** Karte auf eine Einschränkung ziehen. */
  function focusConstraint(id: string) {
    const constraint =
      id === '__preview' ? store.preview : store.constraints.find((c) => c.id === id)
    if (!constraint || !map.value) return

    const origin = L.latLng(constraint.origin.lat, constraint.origin.lon)

    // Zwei Punkte spannen den Ausschnitt selbst auf, ein Radius gibt ihn vor. Bleibt
    // beides aus (Matching, Measuring), würde ein einzelner Punkt zu einem leeren
    // Rechteck und damit zur höchsten Zoomstufe führen — dann ist von der Geometrie
    // nichts mehr zu sehen. Ein fester Umkreis zeigt genug Umgebung.
    const FALLBACK_EXTENT = 8000

    let bounds: L.LatLngBounds
    if (constraint.target) {
      bounds = L.latLngBounds([origin, L.latLng(constraint.target.lat, constraint.target.lon)]).pad(
        0.3,
      )
    } else if (constraint.radiusMeters) {
      bounds = origin.toBounds(constraint.radiusMeters * 2)
    } else {
      bounds = origin.toBounds(FALLBACK_EXTENT * 2)
    }

    // Das Sheet verdeckt den unteren Teil der Karte; ohne den Zuschlag läge die
    // Geometrie genau dahinter.
    map.value.fitBounds(bounds, {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, Math.round(window.innerHeight * SHEET_HALF_RATIO)],
      maxZoom: 15,
    })
  }

  return { bind, draw, focusConstraint }
}
