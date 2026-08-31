import { watch, type Ref } from 'vue'
import L from 'leaflet'
import { useQuestionStore } from '../stores/questions'
import { useGameStore } from '../stores/game'
import { bisectorLine, distanceMeters, halfPlanePolygon, nearest } from '../lib/geo'
import type { Constraint } from '../types/game'

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
const MAX_POI_MARKERS = 120

/** Antworten, die den Bereich einschliessen statt ihn auszuschliessen. */
const INCLUSIVE = new Set(['yes', 'closer', 'hotter'])

export function useConstraintLayers(map: Ref<L.Map | null>, renderer: Ref<L.Canvas | null>) {
  const store = useQuestionStore()
  const game = useGameStore()

  let group: L.LayerGroup | null = null

  function isInclusive(constraint: Constraint) {
    return INCLUSIVE.has(constraint.answer)
  }

  /** Verschiebbarer Griff für Bezugs- und Zielpunkt. */
  function handleFor(constraint: Constraint, which: 'origin' | 'target', point: L.LatLngExpression) {
    return L.marker(point, {
      pane: HANDLE_PANE,
      draggable: true,
      keyboard: false,
      icon: L.divIcon({
        className: 'constraint-handle-host',
        html: `<span class="constraint-handle" style="--c:${constraint.color}">${which === 'origin' ? 'A' : 'B'}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    })
      .bindTooltip(
        which === 'origin' ? `${constraint.label} — Fragepunkt` : `${constraint.label} — Zielpunkt`,
        { direction: 'top', offset: [0, -12] },
      )
      .on('dragend', (event) => {
        const { lat, lng } = (event.target as L.Marker).getLatLng()
        store.setConstraintPoint(constraint.id, which, { lat, lon: lng })
      })
  }

  function drawRadius(constraint: Constraint, layers: L.Layer[]) {
    const radius = constraint.radiusMeters
    if (!radius) return

    const inclusive = isInclusive(constraint)
    layers.push(
      L.circle([constraint.origin.lat, constraint.origin.lon], {
        renderer: renderer.value ?? undefined,
        radius,
        color: constraint.color,
        weight: 2,
        opacity: 0.95,
        // Gestrichelt heisst „hier nicht" — auch ohne Farbwahrnehmung unterscheidbar.
        dashArray: inclusive ? undefined : '7,5',
        fillColor: inclusive ? constraint.color : EXCLUDED_FILL,
        fillOpacity: inclusive ? 0.12 : 1,
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
   * poi.json — dafür gibt es die Stationsliste, die ohnehin geladen ist.
   */
  function poisFor(constraint: Constraint) {
    if (!constraint.poiCategory) return []
    if (constraint.poiCategory === 'station') {
      return game.visibleStations.map((s) => ({ name: s.name, lat: s.lat, lon: s.lon }))
    }
    return store.poisByCategory.get(constraint.poiCategory) ?? []
  }

  /** Kleiner Punkt für einen Ort, in der Farbe seiner Einschränkung. */
  function poiDot(
    constraint: Constraint,
    poi: { name: string; lat: number; lon: number },
    highlighted: boolean,
  ) {
    // Weisser Ring auch bei den kleinen Punkten: sonst gehen sie neben den
    // Stationsmarkern unter, obwohl bei diesen Fragen sie das Thema sind.
    return L.circleMarker([poi.lat, poi.lon], {
      renderer: renderer.value ?? undefined,
      radius: highlighted ? 9 : 6,
      color: '#ffffff',
      weight: highlighted ? 3 : 2,
      fillColor: constraint.color,
      fillOpacity: 1,
    }).bindTooltip(poi.name, { direction: 'top', offset: [0, -6] })
  }

  /** Tentacles: Kreis um den Fragepunkt und die Orte, die darin liegen. */
  function drawPoiWithin(constraint: Constraint, layers: L.Layer[]) {
    const radius = constraint.radiusMeters
    if (!radius) return

    layers.push(
      L.circle([constraint.origin.lat, constraint.origin.lon], {
        renderer: renderer.value ?? undefined,
        radius,
        color: constraint.color,
        weight: 2,
        opacity: 0.95,
        fillColor: constraint.color,
        fillOpacity: 0.08,
        interactive: false,
      }),
    )

    const inside = poisFor(constraint).filter(
      (poi) => distanceMeters(constraint.origin, poi) <= radius,
    )
    for (const poi of inside) layers.push(poiDot(constraint, poi, false))

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
      layers.push(poiDot(constraint, poi, false))
    }
    layers.push(poiDot(constraint, closest.item, true))

    layers.push(
      L.polyline(
        [
          [constraint.origin.lat, constraint.origin.lon],
          [closest.item.lat, closest.item.lon],
        ],
        { color: constraint.color, weight: 2, opacity: 0.8, dashArray: '4,4', interactive: false },
      ),
    )
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
          fillColor: inclusive ? constraint.color : EXCLUDED_FILL,
          fillOpacity: inclusive ? 0.18 : 1,
          interactive: false,
        }),
      )
    }

    layers.push(poiDot(constraint, closest.item, true))
    layers.push(handleFor(constraint, 'origin', [constraint.origin.lat, constraint.origin.lon]))
  }

  function draw() {
    if (!map.value) return
    group?.remove()
    group = null

    const layers: L.Layer[] = []
    for (const constraint of store.visibleConstraints) {
      if (constraint.viz === 'radius') drawRadius(constraint, layers)
      else if (constraint.viz === 'halfplane') drawHalfPlane(constraint, layers)
      else if (constraint.viz === 'poi-within') drawPoiWithin(constraint, layers)
      else if (constraint.viz === 'poi-nearest') drawPoiNearest(constraint, layers)
      else if (constraint.viz === 'poi-isodistance') drawPoiIsodistance(constraint, layers)
    }

    if (layers.length) group = L.layerGroup(layers).addTo(map.value)
  }

  watch(() => store.constraints, draw, { deep: true })

  function bind() {
    if (!map.value) return
    map.value.createPane(HANDLE_PANE).style.zIndex = '660'
    draw()
  }

  /** Karte auf eine Einschränkung ziehen. */
  function focusConstraint(id: string) {
    const constraint = store.constraints.find((c) => c.id === id)
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

    map.value.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
  }

  return { bind, draw, focusConstraint }
}
