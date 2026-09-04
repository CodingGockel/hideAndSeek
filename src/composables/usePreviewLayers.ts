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
import {
  containsPoint,
  distanceMeters,
  formatDistance,
  nearest,
  nearestPointOnEdges,
  toLatLngRings,
} from '../lib/geo'
import { SHEET_HALF_RATIO } from '../lib/layout'
import { poiPin } from '../lib/poiPin'
import { cssColor } from '../lib/theme'
import type { BorderSegment, DivisionArea, LatLon, MapPreview } from '../types/game'

/**
 * Eigene Ebene für den Ankerpunkt, über dem Standortpunkt (z-index 650). Der Fragepunkt
 * liegt in der Regel genau auf der eigenen Position — ohne das verschwindet er darunter.
 */
const ANCHOR_PANE = 'preview-anchor'

/**
 * Wie viele Nachbarflächen einer Ebene höchstens umrissen werden. Auf Buurt-Ebene
 * liegen im Spielgebiet fast viertausend — gezeichnet wäre das ein Filz, in dem die
 * eigene Fläche untergeht, und für die Frage zählt ohnehin nur die Umgebung.
 */
const MAX_DIVISION_OUTLINES = 40


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
      layers.push(poiPin(poi, neutral()))
    }
    if (closest) {
      layers.push(poiPin(closest.item, accent(), true))
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

    // Alle Orte der Kategorie, ungekappt. Bei „Park" sind das über tausend Marker; das ist
    // dicht, aber gewollt — wer die Frage stellt, will sehen, wo überall welche liegen,
    // und nicht raten, ob hinter dem Rand des Ausschnitts noch einer steht.
    for (const poi of pois) {
      if (poi === closest.item) continue
      layers.push(poiPin(poi, neutral()))
    }
    layers.push(poiPin(closest.item, accent(), true))

    layers.push(originLine(preview, closest.item))
    layers.push(anchorMarker(preview))
  }

  /**
   * Der ungefähre Mittelpunkt einer Fläche — Mitte ihres umschliessenden Rechtecks.
   *
   * Reicht, um die Nachbarn nach Nähe zu sortieren; ein echter Schwerpunkt wäre für
   * diesen Zweck Rechenzeit ohne sichtbaren Unterschied.
   */
  function areaCenter(area: DivisionArea): LatLon {
    let west = 180
    let south = 90
    let east = -180
    let north = -90
    for (const ring of toLatLngRings(area.geometry)) {
      for (const point of ring as [number, number][]) {
        if (point[1] < west) west = point[1]
        if (point[1] > east) east = point[1]
        if (point[0] < south) south = point[0]
        if (point[0] > north) north = point[0]
      }
    }
    return { lat: (south + north) / 2, lon: (west + east) / 2 }
  }

  /** Die Fläche, in der der Punkt liegt — auf dem Wasser gibt es keine. */
  function areaAt(areas: DivisionArea[], point: LatLon): DivisionArea | null {
    return areas.find((area) => containsPoint(area.geometry, point)) ?? null
  }

  /**
   * Eine Fläche als Polygon. Gefüllt und benannt ist nur, was die Frage entscheidet.
   *
   * Der Name steht nicht immer da: bei der Grenzfrage ist die Entfernung die Aussage,
   * und deren Etikett liegt in der Mitte der Linie — also fast auf dem Fragepunkt und
   * damit genau dort, wo auch der Flächenname landen würde. Zwei Beschriftungen
   * übereinander, von denen die wichtigere verdeckt wird.
   */
  function divisionShape(
    area: DivisionArea,
    style: { color: string; filled: boolean; dashed?: boolean; labelled?: boolean },
  ) {
    const shape = L.polygon(toLatLngRings(area.geometry), {
      renderer: renderer.value ?? undefined,
      color: style.color,
      weight: 3,
      opacity: 0.95,
      dashArray: style.dashed ? '7,5' : undefined,
      fill: style.filled,
      fillColor: style.color,
      fillOpacity: 0.18,
      interactive: false,
    })

    return style.labelled
      ? shape.bindTooltip(area.name, {
          permanent: true,
          direction: 'center',
          className: 'division-label',
        })
      : shape
  }

  /**
   * Die Nachbarflächen als dünne Umrisse — sie sind der Massstab, an dem die eigene
   * Fläche überhaupt etwas bedeutet, und bei der Border-Karte zugleich die Grenzen,
   * um die es geht.
   */
  function divisionOutlines(areas: DivisionArea[], own: DivisionArea | null, layers: L.Layer[]) {
    const origin = own ? areaCenter(own) : null
    const neighbours = areas.filter((area) => area !== own)

    const shown = origin
      ? [...neighbours]
          .sort((a, b) => distanceMeters(origin, areaCenter(a)) - distanceMeters(origin, areaCenter(b)))
          .slice(0, MAX_DIVISION_OUTLINES)
      : neighbours.slice(0, MAX_DIVISION_OUTLINES)

    for (const area of shown) {
      layers.push(
        L.polygon(toLatLngRings(area.geometry), {
          renderer: renderer.value ?? undefined,
          color: neutral(),
          // Dünner als die eigene Fläche, aber nicht zart: eine Haarlinie mit halber
          // Deckkraft geht auf der Grundkarte zwischen Autobahnen und Kanälen
          // vollständig unter — nachgemessen, nicht geschätzt.
          weight: 2,
          opacity: 0.85,
          fill: false,
          interactive: false,
        }),
      )
    }
  }

  /**
   * Matching auf einer Verwaltungsebene: die Fläche, in der der Fragepunkt liegt,
   * hervorgehoben und benannt; die Nachbarn als Umriss.
   *
   * Solange die Ebene noch lädt, bleibt der Ankerpunkt allein stehen — die Flächen
   * kommen nach, ein `watch` auf `divisionsVersion` zeichnet dann neu.
   */
  function isDivision(viz: string | undefined): boolean {
    return viz === 'division' || viz === 'division-border'
  }

  /** Der nächste Punkt auf irgendeinem Abschnitt der Grenze. */
  function nearestOnBorder(from: LatLon, segments: BorderSegment[]) {
    let best: { lat: number; lon: number; distance: number } | null = null
    for (const segment of segments) {
      const hit = nearestPointOnEdges(from, segment.geometry)
      if (hit && (!best || hit.distance < best.distance)) best = hit
    }
    return best
  }

  /**
   * Die Landesgrenze: die Linie selbst und die Strecke zum nächsten Punkt darauf.
   *
   * Sie umschliesst keine Fläche, in der jemand stünde — es gibt hier nichts
   * hervorzuheben ausser der Entfernung. Deshalb bleibt die Grenze neutral und trägt
   * nur die Beschriftung des Nachbarlands, und die Aussage steckt allein in der Linie
   * zum Fusspunkt.
   */
  function drawBorder(preview: MapPreview, layers: L.Layer[]) {
    const segments = store.borderSegmentsFor(preview.borderId)

    for (const segment of segments) {
      layers.push(
        L.polyline(toLatLngRings(segment.geometry), {
          renderer: renderer.value ?? undefined,
          color: neutral(),
          weight: 2,
          opacity: 0.85,
          interactive: false,
        }).bindTooltip(`Grenze zu ${segment.with}`, { sticky: true }),
      )
    }

    const hit = nearestOnBorder(preview.origin, segments)
    if (hit) layers.push(originLine(preview, hit))

    layers.push(anchorMarker(preview))
  }

  function drawDivision(preview: MapPreview, layers: L.Layer[]) {
    const areas = store.divisionsFor(preview.divisionLevel)
    const own = areaAt(areas, preview.origin)

    divisionOutlines(areas, own, layers)
    // Bei einer erhaltenen Frage gehört diese Fläche dem Fragenden und bleibt neutral;
    // die Akzentfarbe ist für die eigene reserviert.
    if (own) {
      layers.push(
        divisionShape(own, {
          color: preview.compareToUser ? neutral() : accent(),
          filled: true,
          labelled: true,
        }),
      )
    }

    layers.push(anchorMarker(preview))
  }

  /**
   * Measuring auf einer Verwaltungsebene: dazu die gestrichelte Linie zum nächsten
   * Punkt auf der Grenze, beschriftet mit der Entfernung.
   *
   * Weil die Flächen einer Ebene lückenlos kacheln, ist die nächste Grenze der
   * eigenen Fläche zugleich die nächste Grenze überhaupt — es muss keine zweite
   * Fläche geprüft werden.
   */
  function drawDivisionBorder(preview: MapPreview, layers: L.Layer[]) {
    const areas = store.divisionsFor(preview.divisionLevel)
    const own = areaAt(areas, preview.origin)

    divisionOutlines(areas, own, layers)
    if (own) {
      layers.push(
        divisionShape(own, {
          color: preview.compareToUser ? neutral() : accent(),
          filled: false,
          labelled: false,
        }),
      )
      const hit = nearestPointOnEdges(preview.origin, own.geometry)
      if (hit) layers.push(originLine(preview, hit))
    }

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

    /**
     * Bei den Verwaltungsebenen entscheidet keine Punktentfernung, sondern eine
     * Fläche — eine Linie hätte nichts, worauf sie zeigen könnte. Statt ihrer wird
     * die eigene Fläche in der Akzentfarbe umrissen und benannt. Ist es dieselbe wie
     * die des Fragenden, liegt ein Umriss auf dem anderen und die Antwort steht da.
     */
    if (preview.viz === 'division') {
      const mine = areaAt(store.divisionsFor(preview.divisionLevel), me)
      if (mine) {
        layers.push(divisionShape(mine, { color: accent(), filled: false, dashed: true, labelled: true }))
      }
      return
    }

    // Bei den Grenzfragen gibt es den Punkt sehr wohl. Zwei beschriftete Linien
    // nebeneinander sind „näher" oder „weiter".
    if (preview.viz === 'division-border') {
      const mine = areaAt(store.divisionsFor(preview.divisionLevel), me)
      const hit = mine && nearestPointOnEdges(me, mine.geometry)
      if (hit) layers.push(compareLine(me, hit))
      return
    }

    if (preview.viz === 'border') {
      const hit = nearestOnBorder(me, store.borderSegmentsFor(preview.borderId))
      if (hit) layers.push(compareLine(me, hit))
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
    // Marker — die zwei Linien darauf sind die Aussage.
    const alreadyShown = nearest(preview.origin, candidates)?.item ?? null
    if (mine.item !== alreadyShown) layers.push(poiPin(mine.item, accent(), true))

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
      else if (preview.viz === 'division') drawDivision(preview, layers)
      else if (preview.viz === 'division-border') drawDivisionBorder(preview, layers)
      else if (preview.viz === 'border') drawBorder(preview, layers)
      else drawPoiNearest(preview, layers)

      if (preview.compareToUser) drawComparison(preview, layers)

      if (layers.length) group = L.layerGroup(layers).addTo(map.value)
    }

    const position = game.userPosition
    lastDrawnPosition = position ? { lat: position.lat, lon: position.lon } : null
  }

  watch(() => store.preview, draw, { deep: true })

  // Die Verwaltungsebenen werden erst geladen, wenn eine Frage sie braucht. Bis dahin
  // steht nur der Ankerpunkt auf der Karte; das hier trägt die Flächen nach — und mit
  // ihnen den Ausschnitt, der ohne sie nicht zu bestimmen war. Je Ebene passiert das
  // genau einmal pro Sitzung, es kommt also niemandem beim Verschieben in die Quere.
  watch(() => store.mapDataVersion, () => {
    draw()
    if (isDivision(store.preview?.viz) || store.preview?.viz === 'border') focusPreview()
  })

  // Auch die Vorschau holt ihre Farben aus dem CSS — nach einem Wechsel neu zeichnen.

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

    // Bei einer Fläche gibt sie den Ausschnitt vor: „welche Gemeente ist das?" ist
    // erst zu sehen, wenn die ganze Fläche im Bild ist. Ein Radius um den Fragepunkt
    // träfe sie nur zufällig.
    //
    // Solange die Geometrie noch lädt, wird der Ausschnitt gar nicht angefasst: der
    // Rückfall unten spannte sonst erst weit auf und sprang beim Eintreffen der Daten
    // wieder zurück. Der Aufruf kommt nach dem Laden von selbst noch einmal.
    if (isDivision(preview.viz) && !store.divisionsFor(preview.divisionLevel).length) return

    /**
     * Die Landesgrenze ist hundert Kilometer lang und liegt ebenso weit weg. Sie ganz
     * ins Bild zu holen hiesse, halb Mitteleuropa zu zeigen; was die Karte aussagt, ist
     * die Strecke vom Fragepunkt zum nächsten Punkt darauf — die spannt den Ausschnitt.
     */
    if (preview.viz === 'border') {
      const segments = store.borderSegmentsFor(preview.borderId)
      if (!segments.length) return

      const hit = nearestOnBorder(preview.origin, segments)
      if (!hit) return

      const borderBounds = L.latLngBounds([
        [preview.origin.lat, preview.origin.lon],
        [hit.lat, hit.lon],
      ])
      const position = game.userPosition
      if (preview.compareToUser && position) borderBounds.extend([position.lat, position.lon])
      map.value.fitBounds(borderBounds, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, Math.round(window.innerHeight * SHEET_HALF_RATIO)],
        maxZoom: 15,
      })
      return
    }

    const own = isDivision(preview.viz)
      ? areaAt(store.divisionsFor(preview.divisionLevel), preview.origin)
      : null
    if (own) {
      const areaBounds = L.latLngBounds(toLatLngRings(own.geometry).flat())
      const position = game.userPosition
      if (preview.compareToUser && position) areaBounds.extend([position.lat, position.lon])
      map.value.fitBounds(areaBounds, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, Math.round(window.innerHeight * SHEET_HALF_RATIO)],
        maxZoom: 15,
      })
      return
    }

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
