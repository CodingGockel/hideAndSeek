<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useGameStore } from './stores/game'
import { useGeolocation } from './composables/useGeolocation'
import GameMap from './components/GameMap.vue'
import BottomSheet from './components/BottomSheet.vue'
import StationList from './components/StationList.vue'
import StationDetail from './components/StationDetail.vue'
import { formatDistance } from './lib/geo'
import type { TransportMode } from './types/game'

const store = useGameStore()
const geo = useGeolocation()

const mapRef = ref<InstanceType<typeof GameMap> | null>(null)
const sheetRef = ref<InstanceType<typeof BottomSheet> | null>(null)
const pickerOpen = ref(false)

onMounted(store.load)

watch(geo.fix, (fix) => {
  store.userPosition = fix
})

// Eine Station lässt sich auch durch Antippen des Markers auswählen. Dann liegt das
// Detail im eingeklappten Sheet und wäre unsichtbar — also aufklappen.
watch(
  () => store.selectedId,
  (id) => {
    if (id) sheetRef.value?.expand()
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
  if (geo.status.value === 'idle') {
    return { tone: 'muted', label: 'Ortung aus', detail: 'Zum Prüfen des Verstecks einschalten' }
  }
  if (geo.status.value === 'locating') {
    return { tone: 'muted', label: 'Suche Standort…', detail: null }
  }
  if (geo.message.value) {
    return { tone: 'bad', label: 'Ortung nicht möglich', detail: geo.message.value }
  }

  const spot = store.currentHidingSpot
  if (spot) {
    return {
      tone: 'ok',
      label: 'Gültiges Versteck',
      detail: `${spot.name} · ${formatDistance(spot.distance)}`,
    }
  }

  const nearest = store.nearestStation
  return {
    tone: 'bad',
    label: 'Kein gültiges Versteck',
    detail: nearest ? `${formatDistance(nearest.distance)} bis ${nearest.name}` : null,
  }
})

function onLocate() {
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
</script>

<template>
  <div class="app">
    <header class="status" :class="status.tone">
      <div class="status-text">
        <strong>{{ status.label }}</strong>
        <span v-if="status.detail">{{ status.detail }}</span>
      </div>
      <button type="button" class="locate" :aria-pressed="geo.status.value === 'active'" @click="onLocate">
        {{ geo.status.value === 'idle' ? 'Ortung an' : 'Zentrieren' }}
      </button>
    </header>

    <main class="stage">
      <GameMap ref="mapRef" />

      <p v-if="store.loading" class="overlay">Lade Spieldaten…</p>
      <p v-else-if="store.error" class="overlay error">
        Spieldaten konnten nicht geladen werden: {{ store.error }}
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
          :class="{ on: store.showAllRadii }"
          :aria-pressed="store.showAllRadii"
          @click="store.showAllRadii = !store.showAllRadii"
        >
          Alle Radien
        </button>
      </div>

      <BottomSheet ref="sheetRef">
        <template #header>
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
            <span class="total">{{ store.listedStations.length }} sichtbar</span>
          </div>
        </template>

        <StationDetail v-if="store.selectedStation" @back="onBack" />
        <StationList v-else @select="onSelect" />
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

.filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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

.total {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
