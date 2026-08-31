<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useGameStore } from '../stores/game'
import { useLeafletMap } from '../composables/useLeafletMap'
import { useStationLayers } from '../composables/useStationLayers'

const store = useGameStore()
const container = ref<HTMLElement | null>(null)
const { map, renderer, create, setBasemap } = useLeafletMap(container)
const layers = useStationLayers(map, renderer)

let initialised = false

function init() {
  if (initialised || !store.config || !container.value) return
  initialised = true
  create(store.config)
  if (store.activeBasemap) setBasemap(store.activeBasemap, store.config)
  layers.bind()
}

onMounted(init)
watch(() => store.config, init)

watch(
  () => store.activeBasemap,
  (basemap) => {
    if (basemap && store.config && map.value) setBasemap(basemap, store.config)
  },
)

defineExpose({
  focusStation: layers.focusStation,
  centerOnUser: layers.centerOnUser,
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
