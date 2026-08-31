<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useGameStore } from '../stores/game'
import { useQuestionStore } from '../stores/questions'
import { useLeafletMap } from '../composables/useLeafletMap'
import { useStationLayers } from '../composables/useStationLayers'
import { useConstraintLayers } from '../composables/useConstraintLayers'

const store = useGameStore()
const questions = useQuestionStore()
const container = ref<HTMLElement | null>(null)
const { map, renderer, create, setBasemap } = useLeafletMap(container)
const layers = useStationLayers(map, renderer)
const constraints = useConstraintLayers(map, renderer)

let initialised = false

function init() {
  if (initialised || !store.config || !container.value) return
  initialised = true
  create(store.config)
  if (store.activeBasemap) setBasemap(store.activeBasemap, store.config)
  layers.bind()
  constraints.bind()

  map.value?.on('click', (event) => {
    const point = { lat: event.latlng.lat, lon: event.latlng.lng }

    // Standort setzen geht vor: das ist die zuletzt ausdrücklich angeforderte Aktion.
    if (store.placingPosition) {
      store.setManualPosition(point)
      return
    }

    // Fehlt einer Thermometer-Frage noch der Zielpunkt, setzt ihn der nächste Tap.
    const pending = questions.awaitingTarget
    if (pending) questions.setConstraintPoint(pending.id, 'target', point)
  })
}

onMounted(init)
watch(() => store.config, init)

watch(
  () => store.activeBasemap,
  (basemap) => {
    if (basemap && store.config && map.value) setBasemap(basemap, store.config)
  },
)

/** Rückfall für den Bezugspunkt einer Frage, wenn keine Ortung läuft. */
function getCenter() {
  const center = map.value?.getCenter()
  return center ? { lat: center.lat, lon: center.lng } : null
}

defineExpose({
  focusStation: layers.focusStation,
  centerOnUser: layers.centerOnUser,
  focusConstraint: constraints.focusConstraint,
  getCenter,
})
</script>

<template>
  <div ref="container" class="map" aria-label="Spielgebietskarte"></div>
</template>

<style scoped>
.map {
  position: absolute;
  inset: 0;
  background: var(--surface-sunken);
}
</style>
