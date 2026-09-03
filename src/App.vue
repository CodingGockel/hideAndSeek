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

// Ein Halt lässt sich auch durch Antippen des Markers auswählen. Dann liegt das
// Detail im eingeklappten Sheet und wäre unsichtbar — also aufklappen.
watch(
  () => store.selectedId,
  (id) => {
    if (!id) return
    // Marker angetippt: das Detail liegt im Haltestellen-Bereich, also dorthin wechseln
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

/**
 * Die Kernaussage der App, verdichtet auf die Farbe eines Knopfs: zählt der aktuelle
 * Standort als Versteck? Grün ja, rot nein, grau „weiss ich nicht". Der Text dazu
 * steckt im `title` — auf der Karte wäre er nur ein Balken, der Platz frisst.
 */
const locate = computed(() => {
  const suffix = store.isManualPosition ? ' · Standort gesetzt' : ''

  // Grün oder rot setzt einen bekannten Standort voraus — geortet oder gesetzt.
  if (store.userPosition) {
    const spot = store.currentHidingSpot
    return {
      tone: spot ? 'ok' : 'bad',
      hint: (spot ? `Gültiges Versteck — ${spot.name}` : 'Kein gültiges Versteck') + suffix,
    }
  }

  // Ohne Balken ist der Knopf der einzige Ort, an dem der Grund stehen kann.
  if (geo.message.value) return { tone: 'off', hint: geo.message.value }
  if (geo.status.value === 'locating') return { tone: 'off', hint: 'Suche Standort…' }
  return { tone: 'off', hint: 'Ortung aus — antippen zum Einschalten' }
})

/** Beschriftung des Ortungsknopfs — er hat drei Aufgaben. */
const locateLabel = computed(() => {
  if (store.isManualPosition) return 'GPS nutzen'
  // „Zentrieren" nur, wenn es auch etwas zu zentrieren gibt. Nach einer abgelehnten
  // oder gescheiterten Ortung ist der nächste Druck ein neuer Versuch.
  if (store.userPosition) return 'Zentrieren'
  return geo.status.value === 'locating' ? 'Suche…' : 'Ortung an'
})

/**
 * Ortungsfehler standen früher im Statusbalken. Ohne ihn brauchen sie einen eigenen
 * Platz — weggeklickt bleiben sie weg, bis eine andere Meldung kommt.
 */
const dismissedGeoMessage = ref<string | null>(null)
const geoNotice = computed(() =>
  geo.message.value && geo.message.value !== dismissedGeoMessage.value ? geo.message.value : null,
)

function onLocate() {
  if (store.isManualPosition) {
    store.clearManualPosition()
    if (!store.gpsPosition) geo.start()
    return
  }
  if (store.userPosition) mapRef.value?.centerOnUser()
  else geo.start()
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

// Verlässt man den Fragen-Bereich, ist eine unbestätigte Vorschau gegenstandslos.
watch(tab, (value) => {
  if (value !== 'questions') questions.clearPreview()
})

function onPreviewQuestion(question: Question | null, radiusMeters: number | null) {
  if (!question) {
    questions.clearPreview()
    return
  }
  const origin = originForQuestion()
  if (!origin) return

  const preview = questions.setPreview(question, origin, radiusMeters)
  if (!preview) return

  // Halb aufklappen statt ganz: so ist die Geometrie oben zu sehen und die
  // Antwortknöpfe bleiben unten erreichbar.
  sheetRef.value?.expand()
  mapRef.value?.focusConstraint(preview.id)
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
    <main class="stage">
      <GameMap ref="mapRef" />

      <button
        type="button"
        class="locate"
        :class="locate.tone"
        :title="locate.hint"
        :aria-label="locate.hint"
        @click="onLocate"
      >
        {{ locateLabel }}
      </button>

      <p v-if="store.loading" class="overlay">Lade Spieldaten…</p>
      <p v-else-if="store.error" class="overlay error">
        Spieldaten konnten nicht geladen werden: {{ store.error }}
      </p>
      <p v-else-if="geoNotice" class="overlay error">
        {{ geoNotice }}
        <button type="button" @click="dismissedGeoMessage = geoNotice">OK</button>
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
              Haltestellen
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
          <QuestionList @show="onShowQuestion" @preview="onPreviewQuestion" />
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

/* Schwebt über der Karte oben rechts; die Farbe trägt die Aussage des früheren
   Statusbalkens. Optik wie die Knöpfe unten rechts (.fab), damit die rechte Spalte
   eine Einheit bleibt. */
.locate {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top));
  right: 12px;
  z-index: 550;
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

/* --on-accent statt Weiss: im Dark Mode sind --ok und --bad helle Töne. */
.locate.ok {
  background: var(--ok);
  border-color: var(--ok);
  color: var(--on-accent);
}

.locate.bad {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}

.stage {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.overlay {
  position: absolute;
  /* Unter dem Ortungsknopf, sonst verdeckt die Einblendung ihn. */
  top: calc(60px + env(safe-area-inset-top));
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
  display: flex;
  align-items: center;
  gap: 12px;
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

.overlay.error button,
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
