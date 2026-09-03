<script setup lang="ts">
import { useGameStore } from '../stores/game'
import { formatDistance } from '../lib/geo'
import ModeBadges from './ModeBadges.vue'

const emit = defineEmits<{ select: [id: string] }>()
const store = useGameStore()
</script>

<template>
  <div>
    <input
      v-model="store.search"
      class="search"
      type="search"
      inputmode="search"
      placeholder="Haltestelle suchen…"
      aria-label="Haltestelle suchen"
    />

    <p v-if="!store.listedStations.length" class="empty">
      Keine Haltestelle gefunden. Suchbegriff oder Filter anpassen.
    </p>

    <ul class="list">
      <li v-for="station in store.listedStations" :key="station.id">
        <button
          type="button"
          class="row"
          :class="{ active: station.id === store.selectedId }"
          @click="emit('select', station.id)"
        >
          <span class="info">
            <span class="name">{{ station.name }}</span>
            <ModeBadges :station="station" />
          </span>
          <span class="distance" :class="{ near: station.withinHidingRadius }">
            {{ formatDistance(station.distance) }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.search {
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 8px;
  font-size: 16px; /* unter 16px zoomt iOS beim Fokus in das Feld hinein */
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-sunken);
  color: inherit;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 8px 4px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: none;
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.row.active {
  background: var(--accent-soft);
}

.info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.distance {
  flex: none;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  color: var(--text-muted);
}

.distance.near {
  color: var(--ok);
  font-weight: 700;
}

.empty {
  padding: 24px 4px;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
