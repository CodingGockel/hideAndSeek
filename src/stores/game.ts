import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  AppConfig,
  Station,
  StationWithDistance,
  StationsFile,
  TransportMode,
} from '../types/game'
import { distanceMeters } from '../lib/geo'

const BASE = import.meta.env.BASE_URL
const PREFS_KEY = 'hs.prefs.v2'

interface Prefs {
  activeModes: TransportMode[]
  showAllRadii: boolean
  basemapId: string | null
  manualPosition: { lat: number; lon: number } | null
}

const DEFAULT_PREFS: Prefs = {
  activeModes: ['train', 'metro', 'tram', 'bus', 'ferry'],
  showAllRadii: false,
  basemapId: null,
  manualPosition: null,
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    // Privater Modus oder blockierter Storage — Defaults sind gut genug.
    return DEFAULT_PREFS
  }
}

export const useGameStore = defineStore('game', () => {
  const prefs = loadPrefs()

  const config = ref<AppConfig | null>(null)
  const stations = ref<Station[]>([])
  const area = ref<GeoJSON.FeatureCollection | null>(null)
  const dataDate = ref<string>('')

  const loading = ref(true)
  const error = ref<string | null>(null)

  const selectedId = ref<string | null>(null)
  const search = ref('')
  const activeModes = ref<Set<TransportMode>>(new Set(prefs.activeModes))
  const showAllRadii = ref(prefs.showAllRadii)
  const basemapId = ref<string | null>(prefs.basemapId)

  /** Was die Ortung liefert. */
  const gpsPosition = ref<{ lat: number; lon: number; accuracy: number } | null>(null)

  /**
   * Von Hand auf der Karte gesetzter Standort. Nützlich zum Planen ohne GPS und
   * wenn die Ortung im Zug daneben liegt.
   */
  const manualPosition = ref<{ lat: number; lon: number } | null>(prefs.manualPosition)

  /** Wartet die Karte gerade auf einen Tap, um den Standort zu setzen? */
  const placingPosition = ref(false)

  /**
   * Der gesetzte Punkt hat Vorrang vor der Ortung — sonst würde ihn das nächste
   * GPS-Update überschreiben, und Setzen wäre sinnlos.
   */
  const userPosition = computed(() =>
    manualPosition.value ? { ...manualPosition.value, accuracy: 0 } : gpsPosition.value,
  )

  const isManualPosition = computed(() => manualPosition.value !== null)

  watch(
    [activeModes, showAllRadii, basemapId, manualPosition],
    () => {
      try {
        localStorage.setItem(
          PREFS_KEY,
          JSON.stringify({
            activeModes: [...activeModes.value],
            showAllRadii: showAllRadii.value,
            basemapId: basemapId.value,
            manualPosition: manualPosition.value,
          } satisfies Prefs),
        )
      } catch {
        // Storage nicht verfügbar — die Einstellung gilt dann nur für diese Sitzung.
      }
    },
    { deep: true },
  )

  const hidingRadius = computed(() => config.value?.hidingRadiusMeters ?? 800)

  const basemaps = computed(() => config.value?.basemaps ?? [])

  /** Die gemerkte Karte, oder die erste — eine ungültige gespeicherte ID fällt zurück. */
  const activeBasemap = computed(
    () => basemaps.value.find((b) => b.id === basemapId.value) ?? basemaps.value[0] ?? null,
  )

  /** Halte, die bespielbar sind — explizit ausgeschlossene fliegen raus. */
  const playable = computed(() => stations.value.filter((s) => s.ticketValid !== false))

  /**
   * Nur die Bahnhöfe. „Ist dein nächster Bahnhof meiner?" darf nicht plötzlich
   * Bushaltestellen meinen, seit auch die in der Liste stehen.
   */
  const railStations = computed(() => playable.value.filter((s) => s.isStation))

  /** Bespielbare Halte mit Entfernung zur aktuellen Position. */
  const withDistance = computed<StationWithDistance[]>(() => {
    const pos = userPosition.value
    const radius = hidingRadius.value
    return playable.value.map((s) => {
      const distance = pos ? distanceMeters(pos, s) : null
      return {
        ...s,
        distance,
        withinHidingRadius: distance !== null && distance <= radius,
      }
    })
  })

  /** Was auf der Karte liegt: nach Verkehrsmittel gefiltert. */
  const visibleStations = computed(() =>
    withDistance.value.filter((s) => activeModes.value.has(s.mode)),
  )

  /** Was in der Liste steht: zusätzlich nach Suchbegriff, nach Entfernung sortiert. */
  const listedStations = computed(() => {
    const q = search.value.trim().toLowerCase()
    const matches = (s: StationWithDistance) =>
      s.name.toLowerCase().includes(q) || s.aliases.some((a) => a.toLowerCase().includes(q))
    const rows = q ? visibleStations.value.filter(matches) : [...visibleStations.value]

    return rows.sort((a, b) => {
      // Bei aktiver Suche zuerst nach Treffergüte: wer "Haarlem" tippt, meint
      // Haarlem und nicht Haarlem Spaarnwoude, auch wenn das näher liegt.
      if (q) {
        const rank = (name: string) =>
          name.toLowerCase() === q ? 0 : name.toLowerCase().startsWith(q) ? 1 : 2
        const byRank = rank(a.name) - rank(b.name)
        if (byRank !== 0) return byRank
      }
      if (a.distance === null || b.distance === null) return a.name.localeCompare(b.name, 'nl')
      return a.distance - b.distance
    })
  })

  const selectedStation = computed(
    () => withDistance.value.find((s) => s.id === selectedId.value) ?? null,
  )

  /**
   * Der Halt, in dessen Versteck-Radius man gerade steht. Damit beantwortet die App
   * die einzige Frage, die der Hider unterwegs wirklich hat: zählt das hier als Versteck?
   */
  const currentHidingSpot = computed(() => {
    if (!userPosition.value) return null
    let best: StationWithDistance | null = null
    for (const s of withDistance.value) {
      if (!s.withinHidingRadius) continue
      if (!best || (s.distance ?? Infinity) < (best.distance ?? Infinity)) best = s
    }
    return best
  })

  const nearestStation = computed(() => {
    if (!userPosition.value) return null
    return listedStations.value.find((s) => s.distance !== null) ?? null
  })

  const modeCounts = computed(() => {
    // Ausgangspunkt sind die Verkehrsmittel aus der Konfiguration, damit auch eines
    // ohne Halte eine Null bekommt statt undefined.
    const counts = Object.fromEntries(
      Object.keys(config.value?.modes ?? {}).map((m) => [m, 0]),
    ) as Record<TransportMode, number>
    for (const s of playable.value) counts[s.mode] = (counts[s.mode] ?? 0) + 1
    return counts
  })

  async function loadJson<T>(file: string): Promise<T> {
    const res = await fetch(`${BASE}data/${file}`)
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
    return res.json()
  }

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [cfg, stationsFile, areaFile] = await Promise.all([
        loadJson<AppConfig>('config.json'),
        loadJson<StationsFile>('stations.json'),
        loadJson<GeoJSON.FeatureCollection>('area.geojson').catch(() => null),
      ])
      config.value = cfg
      stations.value = stationsFile.stations
      dataDate.value = stationsFile.generatedAt
      area.value = areaFile
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  function select(id: string | null) {
    selectedId.value = id
  }

  function setManualPosition(point: { lat: number; lon: number }) {
    manualPosition.value = point
    placingPosition.value = false
  }

  /** Zurück zur Ortung. */
  function clearManualPosition() {
    manualPosition.value = null
    placingPosition.value = false
  }

  function toggleMode(mode: TransportMode) {
    const next = new Set(activeModes.value)
    if (next.has(mode)) next.delete(mode)
    else next.add(mode)
    // Alles abzuwählen zeigt eine leere Karte und sieht wie ein Fehler aus.
    if (next.size) activeModes.value = next
  }

  return {
    config,
    stations,
    area,
    dataDate,
    loading,
    error,
    selectedId,
    search,
    activeModes,
    showAllRadii,
    basemapId,
    basemaps,
    activeBasemap,
    gpsPosition,
    manualPosition,
    placingPosition,
    isManualPosition,
    userPosition,
    hidingRadius,
    railStations,
    visibleStations,
    listedStations,
    selectedStation,
    currentHidingSpot,
    nearestStation,
    modeCounts,
    load,
    select,
    toggleMode,
    setManualPosition,
    clearManualPosition,
  }
})
