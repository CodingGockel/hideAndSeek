<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useGameStore } from './stores/game'
import { useQuestionStore } from './stores/questions'
import { useGeolocation } from './composables/useGeolocation'
import GameMap from './components/GameMap.vue'
import BottomSheet from './components/BottomSheet.vue'
import StationList from './components/StationList.vue'
import StationDetail from './components/StationDetail.vue'
import QuestionList from './components/QuestionList.vue'
import ConstraintList from './components/ConstraintList.vue'
import { formatDistance } from './lib/geo'
import type { Question, TransportMode } from './types/game'

const store = useGameStore()
const questions = useQuestionStore()
const geo = useGeolocation()

type Tab = 'stations' | 'questions'
const tab = ref<Tab>('stations')

const mapRef = ref<InstanceType<typeof GameMap> | null>(null)
const sheetRef = ref<InstanceType<typeof BottomSheet> | null>(null)
const pickerOpen = ref(false)

onMounted(() => {
  store.load()
  questions.load()
})

watch(geo.fix, (fix) => {
  store.gpsPosition = fix
})

// Eine Station lässt sich auch durch Antippen des Markers auswählen. Dann liegt das
// Detail im eingeklappten Sheet und wäre unsichtbar — also aufklappen.
watch(
  () => store.selectedId,
  (id) => {
    if (!id) return
    // Marker angetippt: das Detail liegt im Stationen-Bereich, also dorthin wechseln
    // und aufklappen — sonst passiert scheinbar nichts.
    tab.value = 'stations'
    sheetRef.value?.expand()
  },
)

// Verkehrsmittel, die in den Daten gar nicht vorkommen, brauchen keinen Filter-Chip.
const modes = computed(() =>
  (Object.keys(store.config?.modes ?? {}) as TransportMode[]).filter(
    (mode) => store.modeCounts[mode] > 0,
  ),
)

/** Die Kernaussage der App: zählt der aktuelle Standort als Versteck? */
const status = computed(() => {
  // Ein gesetzter Standort ersetzt die Ortung — dann interessiert deren Zustand nicht.
  if (!store.isManualPosition) {
    if (geo.status.value === 'idle') {
      return {
        tone: 'muted',
        label: 'Ortung aus',
        detail: 'Einschalten oder Standort auf der Karte setzen',
      }
    }
    if (geo.status.value === 'locating') {
      return { tone: 'muted', label: 'Suche Standort…', detail: null }
    }
    if (geo.message.value) {
      return { tone: 'bad', label: 'Ortung nicht möglich', detail: geo.message.value }
    }
  }

  const suffix = store.isManualPosition ? ' · gesetzt' : ''
  const spot = store.currentHidingSpot
  if (spot) {
    return {
      tone: 'ok',
      label: 'Gültiges Versteck',
      detail: `${spot.name} · ${formatDistance(spot.distance)}${suffix}`,
    }
  }

  const nearest = store.nearestStation
  return {
    tone: 'bad',
    label: 'Kein gültiges Versteck',
    detail: nearest ? `${formatDistance(nearest.distance)} bis ${nearest.name}${suffix}` : null,
  }
})

/** Beschriftung des Knopfs in der Statusleiste — er hat drei Aufgaben. */
const locateLabel = computed(() => {
  if (store.isManualPosition) return 'GPS nutzen'
  return geo.status.value === 'idle' ? 'Ortung an' : 'Zentrieren'
})

function onLocate() {
  if (store.isManualPosition) {
    store.clearManualPosition()
    if (geo.status.value === 'idle') geo.start()
    return
  }
  if (geo.status.value === 'idle') geo.start()
  else mapRef.value?.centerOnUser()
}

function onSelect(id: string) {
  store.select(id)
  mapRef.value?.focusStation(id)
}

function onBack() {
  store.select(null)
}

function chooseBasemap(id: string) {
  store.basemapId = id
  pickerOpen.value = false
}

/**
 * Bezugspunkt einer Frage: der eigene Standort, sonst die Kartenmitte. Ohne
 * Rückfall wäre die Fragen-Visualisierung ohne Ortung gar nicht benutzbar.
 */
function originForQuestion() {
  if (store.userPosition) {
    return { lat: store.userPosition.lat, lon: store.userPosition.lon }
  }
  return mapRef.value?.getCenter() ?? null
}

function onShowQuestion(question: Question, answer: string, radiusMeters: number | null) {
  const origin = originForQuestion()
  if (!origin) return
  const constraint = questions.addConstraint(question, origin, answer, { radiusMeters })
  // Beim Thermometer fehlt noch der Zielpunkt — die Karte muss dafür sichtbar sein.
  if (constraint.viz === 'halfplane') sheetRef.value?.collapse()
  else mapRef.value?.focusConstraint(constraint.id)
}

function onFocusConstraint(id: string) {
  mapRef.value?.focusConstraint(id)
  sheetRef.value?.collapse()
}
</script>

<template>
  <div class="app">
    <header class="status" :class="status.tone">
      <div class="status-text">
        <strong>{{ status.label }}</strong>
        <span v-if="status.detail">{{ status.detail }}</span>
      </div>
      <button type="button" class="locate" :aria-pressed="geo.status.value === 'active'" @click="onLocate">
        {{ locateLabel }}
      </button>
    </header>

    <main class="stage">
      <GameMap ref="mapRef" />

      <p v-if="store.loading" class="overlay">Lade Spieldaten…</p>
      <p v-else-if="store.error" class="overlay error">
        Spieldaten konnten nicht geladen werden: {{ store.error }}
      </p>

      <p v-if="store.placingPosition" class="overlay hint">
        Tippe auf die Karte, wo du stehst
        <button type="button" @click="store.placingPosition = false">Abbrechen</button>
      </p>

      <p v-else-if="questions.awaitingTarget" class="overlay hint">
        Tippe auf die Karte, wohin du gefahren bist
        <button type="button" @click="questions.removeConstraint(questions.awaitingTarget.id)">
          Abbrechen
        </button>
      </p>

      <div class="fabs">
        <div v-if="pickerOpen" class="picker" role="radiogroup" aria-label="Kartentyp">
          <button
            v-for="basemap in store.basemaps"
            :key="basemap.id"
            type="button"
            class="picker-item"
            :class="{ on: basemap.id === store.activeBasemap?.id }"
            role="radio"
            :aria-checked="basemap.id === store.activeBasemap?.id"
            @click="chooseBasemap(basemap.id)"
          >
            {{ basemap.label }}
          </button>
        </div>

        <button
          type="button"
          class="fab"
          :aria-expanded="pickerOpen"
          @click="pickerOpen = !pickerOpen"
        >
          {{ store.activeBasemap?.label ?? 'Karte' }}
        </button>

        <button
          type="button"
          class="fab"
          :class="{ on: store.placingPosition || store.isManualPosition }"
          :aria-pressed="store.placingPosition"
          @click="store.placingPosition = !store.placingPosition"
        >
          Standort setzen
        </button>

        <button
          type="button"
          class="fab"
          :class="{ on: store.showAllRadii }"
          :aria-pressed="store.showAllRadii"
          @click="store.showAllRadii = !store.showAllRadii"
        >
          Alle Radien
        </button>
      </div>

      <BottomSheet ref="sheetRef">
        <template #header>
          <div class="tabs">
            <button
              type="button"
              class="tab"
              :class="{ on: tab === 'stations' }"
              @click="tab = 'stations'"
            >
              Stationen
              <span class="tab-count">{{ store.listedStations.length }}</span>
            </button>
            <button
              type="button"
              class="tab"
              :class="{ on: tab === 'questions' }"
              @click="tab = 'questions'"
            >
              Fragen
              <span class="tab-count">{{ questions.usedCount }}/{{ questions.allQuestions.length }}</span>
            </button>
          </div>
        </template>

        <template v-if="tab === 'stations'">
          <div class="filters">
            <button
              v-for="mode in modes"
              :key="mode"
              type="button"
              class="chip"
              :class="{ on: store.activeModes.has(mode) }"
              :aria-pressed="store.activeModes.has(mode)"
              :style="{ '--chip': store.config?.modes[mode]?.color }"
              @click="store.toggleMode(mode)"
            >
              {{ store.config?.modes[mode]?.label }}
              <span class="count">{{ store.modeCounts[mode] }}</span>
            </button>
          </div>

          <StationDetail v-if="store.selectedStation" @back="onBack" />
          <StationList v-else @select="onSelect" />
        </template>

        <template v-else>
          <ConstraintList @focus="onFocusConstraint" />
          <QuestionList @show="onShowQuestion" />
        </template>
      </BottomSheet>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.status {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(8px + env(safe-area-inset-top)) 16px 8px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  z-index: 600;
}

.status.ok {
  background: var(--ok-soft);
  color: var(--ok);
}

.status.bad {
  background: var(--bad-soft);
  color: var(--bad);
}

.status-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.status-text strong {
  font-size: 15px;
}

.status-text span {
  font-size: 13px;
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.locate {
  flex: none;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.stage {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.overlay {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 2px 12px rgb(15 23 42 / 0.15);
  font-size: 14px;
  z-index: 550;
}

.overlay.error {
  background: var(--bad-soft);
  color: var(--bad);
}

.overlay.hint {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
}

.overlay.hint button {
  margin-left: auto;
  padding: 6px 10px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.fabs {
  position: absolute;
  right: 12px;
  bottom: 124px;
  z-index: 550;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.picker {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 4px 16px rgb(15 23 42 / 0.22);
}

.picker-item {
  min-height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
  cursor: pointer;
}

.picker-item.on {
  background: var(--accent);
  color: var(--on-accent);
}

.fab {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 2px 10px rgb(15 23 42 / 0.15);
  cursor: pointer;
}

.fab.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

.tabs {
  display: flex;
  gap: 6px;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.tab.on {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.tab-count {
  font-size: 11px;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.chip.on {
  border-color: var(--chip);
  color: var(--chip);
  background: color-mix(in srgb, var(--chip) 12%, transparent);
}

.count {
  font-size: 11px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

</style>
