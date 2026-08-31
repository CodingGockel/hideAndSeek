<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { formatDistance } from '../lib/geo'
import ModeBadges from './ModeBadges.vue'

const emit = defineEmits<{ back: [] }>()
const store = useGameStore()

const station = computed(() => store.selectedStation)

const mapsUrl = computed(() =>
  station.value
    ? `https://www.google.com/maps/search/?api=1&query=${station.value.lat},${station.value.lon}`
    : '#',
)

/**
 * Der Satz, für den die App eigentlich da ist: zählt der aktuelle Standort als
 * Versteck an dieser Station?
 */
const verdict = computed(() => {
  const s = station.value
  if (!s) return null
  if (s.distance === null) return { tone: 'muted', text: 'Standort unbekannt — Ortung einschalten.' }
  if (s.withinHidingRadius) {
    return {
      tone: 'ok',
      text: `Gültiges Versteck — ${formatDistance(s.distance)} von ${s.name}.`,
    }
  }
  const missing = s.distance - store.hidingRadius
  return {
    tone: 'bad',
    text: `Kein gültiges Versteck — ${formatDistance(missing)} zu weit weg.`,
  }
})
</script>

<template>
  <div v-if="station" class="detail">
    <button type="button" class="back" @click="emit('back')">← Alle Stationen</button>

    <h2 class="name">{{ station.name }}</h2>
    <ModeBadges :modes="station.modes" />

    <p class="verdict" :class="verdict?.tone">{{ verdict?.text }}</p>

    <dl class="facts">
      <div>
        <dt>Entfernung</dt>
        <dd>{{ formatDistance(station.distance) }}</dd>
      </div>
      <div>
        <dt>Versteck-Radius</dt>
        <dd>{{ store.hidingRadius }} m</dd>
      </div>
      <div v-if="station.operators.length">
        <dt>Betreiber</dt>
        <dd>{{ station.operators.join(', ') }}</dd>
      </div>
      <div v-if="station.lines.length">
        <dt>Linien</dt>
        <dd>{{ station.lines.join(', ') }}</dd>
      </div>
    </dl>

    <p v-if="station.notes" class="note">{{ station.notes }}</p>

    <a class="link" :href="mapsUrl" target="_blank" rel="noopener">In Karten öffnen ↗</a>
  </div>
</template>

<style scoped>
.detail {
  padding-bottom: 8px;
}

.back {
  padding: 8px 0;
  margin-bottom: 4px;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.name {
  margin: 0 0 8px;
  font-size: 20px;
  line-height: 1.2;
}

.verdict {
  margin: 14px 0;
  padding: 12px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}

.verdict.ok {
  background: var(--ok-soft);
  color: var(--ok);
}

.verdict.bad {
  background: var(--bad-soft);
  color: var(--bad);
}

.verdict.muted {
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-weight: 500;
}

.facts {
  margin: 0 0 14px;
  display: grid;
  gap: 2px;
}

.facts > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}

dt {
  color: var(--text-muted);
  font-size: 14px;
}

dd {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-align: right;
}

.note {
  margin: 10px 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-muted);
}

.link {
  display: inline-block;
  padding: 10px 0;
  color: var(--accent);
  font-size: 15px;
  font-weight: 600;
}
</style>
