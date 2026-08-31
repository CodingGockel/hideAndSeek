import { onUnmounted, watch, type Ref } from 'vue'
import L from 'leaflet'
import { useGameStore } from '../stores/game'
import type { AppConfig, Station, TransportMode } from '../types/game'
import { SHEET_HALF_RATIO } from '../lib/layout'

/**
 * Ganze Welt als äusserer Ring — mit dem Spielgebiet als Loch ergibt das die
 * Abdunkelung aussen herum.
 *
 * ±85.05° statt ±90°: Web-Mercator bildet die Pole auf Unendlich ab, ein Ring bis
 * ±90° lässt sich nicht projizieren und das Polygon wird dann gar nicht gezeichnet.
 */
const MERCATOR_LIMIT = 85.05
const WORLD_RING: L.LatLngExpression[] = [
  [-MERCATOR_LIMIT, -180],
  [-MERCATOR_LIMIT, 180],
  [MERCATOR_LIMIT, 180],
  [MERCATOR_LIMIT, -180],
]

const USER_PANE = 'user-position'

/**
 * Unterhalb dieser Zoomstufe schrumpfen die Marker auf einfache Punkte. Volle
 * 26-px-Pins verklumpen in der Amsterdamer Innenstadt sonst zu einem Haufen, in
 * dem man weder Symbol noch einzelne Station erkennt.
 */
const COMPACT_BELOW_ZOOM = 12

/**
 * Leaflet erwartet konkrete Farbwerte, das Farbschema steckt aber in CSS-Variablen.
 * Also einmal auslesen — und bei einem Themenwechsel neu zeichnen.
 */
function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * Piktogramme im 24er-Raster, weiss auf der Farbe des Verkehrsmittels. Bei rund
 * 16 px Kantenlänge muss die Form kräftig und geschlossen sein — feine Linien
 * verschwinden auf der Karte.
 */
const GLYPHS: Record<TransportMode, string> = {
  train:
    'M12 2c-4 0-7 .5-7 4v8.5A2.5 2.5 0 0 0 7.5 17L6 19.5v.5h2l1.5-2h5l1.5 2h2v-.5L16.5 17a2.5 2.5 0 0 0 2.5-2.5V6c0-3.5-3-4-7-4zM7.5 7h9v4.5h-9zm2 6.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm5 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z',
  metro: 'M4.5 19V5h3.2l4.3 7.4L16.3 5h3.2v14h-2.9v-8.4l-3.3 5.6h-1.6l-3.3-5.6V19z',
  light_rail:
    'M11 2.5V4H8a3 3 0 0 0-3 3v7.5A2.5 2.5 0 0 0 7.5 17L6 19.5v.5h2l1.5-2h5l1.5 2h2v-.5L16.5 17a2.5 2.5 0 0 0 2.5-2.5V7a3 3 0 0 0-3-3h-3V2.5zM7.5 7h9v4.5h-9zm2 6.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm5 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z',
}

function primaryMode(station: Station): TransportMode {
  return station.modes[0] ?? 'train'
}

function colorFor(station: Station, config: AppConfig): string {
  return config.modes[primaryMode(station)]?.color ?? '#475569'
}

/** GeoJSON ist [lon, lat], Leaflet will [lat, lon]. */
function toLatLngRings(geometry: GeoJSON.Geometry): L.LatLngExpression[][] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => ring.map(([lon, lat]) => [lat, lon]))
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((poly) =>
      poly.map((ring) => ring.map(([lon, lat]) => [lat, lon] as L.LatLngExpression)),
    )
  }
  return []
}

export function useStationLayers(map: Ref<L.Map | null>, renderer: Ref<L.Canvas | null>) {
  const store = useGameStore()

  const markers = new Map<string, L.Marker>()
  let compact = false
  let areaLayer: L.LayerGroup | null = null
  let radiusLayer: L.LayerGroup | null = null
  let userLayer: L.LayerGroup | null = null

  function stationIcon(station: Station, selected: boolean): L.DivIcon {
    const config = store.config!
    const color = colorFor(station, config)
    // Die ausgewählte Station bleibt immer gross — sie soll auffindbar bleiben.
    const dense = compact && !selected
    const size = selected ? 34 : dense ? 16 : 26

    // Umsteigeknoten bekommen einen zweiten Ring in der Farbe des weiteren
    // Verkehrsmittels — an Amsterdam Zuid sieht man so direkt Bahn plus Metro.
    const secondary = station.modes[1]
    const ring = secondary ? (config.modes[secondary]?.color ?? color) : null

    const classes = ['station-pin']
    if (selected) classes.push('is-selected')
    if (ring) classes.push('is-interchange')
    if (dense) classes.push('is-compact')

    const glyph = dense
      ? ''
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${GLYPHS[primaryMode(station)]}"/></svg>`

    return L.divIcon({
      className: 'station-pin-host',
      html:
        `<span class="${classes.join(' ')}" style="--pin:${color};--ring:${ring ?? color}">` +
        glyph +
        `</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
  }

  /** Beim Über- oder Unterschreiten der Zoomschwelle alle Marker einmal neu bauen. */
  function updateDensity() {
    const next = (map.value?.getZoom() ?? 99) < COMPACT_BELOW_ZOOM
    if (next === compact) return
    compact = next

    const byId = new Map(store.visibleStations.map((s) => [s.id, s]))
    for (const [id, marker] of markers) {
      const station = byId.get(id)
      if (station) marker.setIcon(stationIcon(station, id === store.selectedId))
    }
  }

  function drawArea() {
    if (!map.value) return
    areaLayer?.remove()
    areaLayer = null

    const feature = store.area?.features?.[0]
    if (!feature?.geometry) return

    const rings = toLatLngRings(feature.geometry)
    if (!rings.length) return

    areaLayer = L.layerGroup([
      // Alles ausserhalb des Spielgebiets abdunkeln.
      L.polygon([WORLD_RING, ...rings], {
        stroke: false,
        fillColor: cssColor('--area-outside', 'rgb(15 23 42 / 0.3)'),
        fillOpacity: 1,
        interactive: false,
      }),
      L.polygon(rings, {
        color: cssColor('--area-border', '#b45309'),
        weight: 3,
        opacity: 0.95,
        dashArray: '8,5',
        fill: false,
        interactive: false,
      }),
    ]).addTo(map.value)
  }

  function drawStations() {
    if (!map.value || !store.config) return

    const wanted = new Set(store.visibleStations.map((s) => s.id))

    for (const [id, marker] of markers) {
      if (!wanted.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    }

    for (const station of store.visibleStations) {
      if (markers.has(station.id)) continue
      const selected = station.id === store.selectedId
      const marker = L.marker([station.lat, station.lon], {
        icon: stationIcon(station, selected),
        zIndexOffset: selected ? 1000 : 0,
        keyboard: false,
      })
        .bindTooltip(station.name, { direction: 'top', offset: [0, -16] })
        .on('click', () => store.select(station.id))
        .addTo(map.value!)
      markers.set(station.id, marker)
    }
  }

  /**
   * Nur die beiden betroffenen Marker neu bauen statt aller sichtbaren: ein
   * DivIcon neu zu setzen heisst DOM-Arbeit, und das bei jedem Antippen für
   * 73 Marker zu tun ruckelt sichtbar.
   */
  function updateSelection(previousId: string | null) {
    for (const id of new Set([previousId, store.selectedId])) {
      if (!id) continue
      const station = store.visibleStations.find((s) => s.id === id)
      const marker = markers.get(id)
      if (!station || !marker) continue
      const selected = id === store.selectedId
      marker.setIcon(stationIcon(station, selected))
      marker.setZIndexOffset(selected ? 1000 : 0)
    }
  }

  function drawRadii() {
    if (!map.value || !store.config) return
    radiusLayer?.remove()

    const circles: L.Circle[] = []
    const radius = store.hidingRadius

    if (store.showAllRadii) {
      for (const station of store.visibleStations) {
        circles.push(
          L.circle([station.lat, station.lon], {
            renderer: renderer.value ?? undefined,
            radius,
            stroke: false,
            fillColor: cssColor('--radius-all', 'rgb(14 165 233 / 0.1)'),
            fillOpacity: 1,
            interactive: false,
          }),
        )
      }
    }

    const selected = store.selectedStation
    if (selected) {
      circles.push(
        L.circle([selected.lat, selected.lon], {
          radius,
          color: colorFor(selected, store.config),
          weight: 2,
          opacity: 0.9,
          fillColor: colorFor(selected, store.config),
          fillOpacity: 0.12,
          interactive: false,
        }),
      )
    }

    radiusLayer = L.layerGroup(circles).addTo(map.value)
  }

  function drawUser() {
    if (!map.value) return
    userLayer?.remove()
    userLayer = null

    const pos = store.userPosition
    if (!pos) return

    userLayer = L.layerGroup([
      L.circle([pos.lat, pos.lon], {
        pane: USER_PANE,
        radius: pos.accuracy,
        stroke: false,
        fillColor: '#2563eb',
        fillOpacity: 0.15,
        interactive: false,
      }),
      L.circleMarker([pos.lat, pos.lon], {
        pane: USER_PANE,
        radius: 7,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
        interactive: false,
      }),
    ]).addTo(map.value)
  }

  // Die Watcher werden im Setup-Scope des Composables registriert, nicht erst in
  // bind(): dort erzeugte Watcher gehörten zu keinem Scope und blieben beim
  // Unmount der Karte als Leak zurück. Die draw-Funktionen prüfen selbst, ob die
  // Karte schon existiert, deshalb ist ein früher Aufruf unschädlich.
  watch(() => store.area, drawArea)

  // Bewusst nur auf die Menge der Stationen reagieren, nicht auf ihre Objekte:
  // jedes GPS-Update erzeugt neue Objekte (die Entfernung ändert sich), und die
  // Marker deswegen neu aufzubauen würde die Karte im Sekundentakt flackern lassen.
  watch(
    () => store.visibleStations.map((s) => s.id).join('|'),
    () => {
      drawStations()
      drawRadii()
    },
  )

  watch(
    () => store.selectedId,
    (_id, previousId) => {
      updateSelection(previousId ?? null)
      drawRadii()
    },
  )

  watch(() => store.showAllRadii, drawRadii)
  watch(() => store.userPosition, drawUser, { deep: true })

  // Wechselt das Gerät zwischen hell und dunkel, gelten andere Overlay-Farben.
  const themeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const onThemeChange = () => {
    drawArea()
    drawRadii()
  }
  themeQuery.addEventListener('change', onThemeChange)
  onUnmounted(() => themeQuery.removeEventListener('change', onThemeChange))

  /** Erstzeichnung, sobald die Karte existiert. */
  function bind() {
    if (!map.value) return
    map.value.createPane(USER_PANE).style.zIndex = '650'

    // Vor dem ersten Zeichnen festlegen, sonst entstehen die Marker in der
    // falschen Grösse und werden sofort wieder ersetzt.
    compact = map.value.getZoom() < COMPACT_BELOW_ZOOM
    map.value.on('zoomend', updateDensity)

    drawArea()
    drawStations()
    drawRadii()
    drawUser()
  }

  /** Karte auf eine Station ziehen — so, dass der Versteck-Radius ganz ins Bild passt. */
  function focusStation(id: string) {
    const station = store.visibleStations.find((s) => s.id === id)
    if (!station || !map.value) return
    // Nicht über L.circle(...).getBounds(): dessen Radius wird erst beim Projizieren
    // auf einer Karte gesetzt, ein freistehendes Circle liefert NaN-Bounds und
    // flyToBounds tut dann gar nichts. toBounds rechnet rein geografisch.
    const bounds = L.latLng(station.lat, station.lon).toBounds(store.hidingRadius * 2)
    // fitBounds statt flyToBounds: die Flug-Animation von Leaflet hat sich im Test
    // als unzuverlässig erwiesen und die Karte teils gar nicht bewegt. fitBounds
    // animiert ebenfalls, kommt aber nachweislich immer an.
    //
    // Nach der Auswahl klappt das Sheet auf, verdeckt also den unteren Teil der
    // Karte. Ohne den Zuschlag unten läge die Station genau dahinter.
    map.value.fitBounds(bounds, {
      paddingTopLeft: [48, 48],
      paddingBottomRight: [48, Math.round(window.innerHeight * SHEET_HALF_RATIO)],
      maxZoom: 15,
    })
  }

  function centerOnUser() {
    const pos = store.userPosition
    if (!pos || !map.value) return
    map.value.setView([pos.lat, pos.lon], Math.max(map.value.getZoom(), 14), { animate: true })
  }

  return { bind, focusStation, centerOnUser }
}
