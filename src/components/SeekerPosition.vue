<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/game'
import { formatLatLon, parseLatLon } from '../lib/share'

const emit = defineEmits<{ close: [] }>()

const store = useGameStore()

/**
 * Die Koordinaten der Sucher kommen als Zeile aus dem Chat („Mein Standort:
 * 52.37897, 4.90042"). Getippt wird nur das Zahlenpaar — es ist die einzige Angabe,
 * die die Frage-Vorschau braucht.
 */
const text = ref(store.seekerPosition ? formatLatLon(store.seekerPosition) : '')
const error = ref<string | null>(null)

function onApply() {
  const point = parseLatLon(text.value)
  if (!point) {
    // Offen lassen: der bisherige Punkt bleibt gültig, und der Tippfehler steht noch da.
    error.value = 'Keine gültigen Koordinaten — erwartet wird „52.37897, 4.90042"'
    return
  }
  store.setSeekerPosition(point)
  emit('close')
}

function onClear() {
  store.clearSeekerPosition()
  emit('close')
}
</script>

<template>
  <div class="seeker" role="dialog" aria-label="Standort der Sucher">
    <div class="head">
      <strong>Standort der Sucher</strong>
      <button type="button" class="close" aria-label="Schliessen" @click="emit('close')">×</button>
    </div>

    <label class="field">
      Koordinaten
      <input
        v-model="text"
        type="text"
        inputmode="decimal"
        placeholder="52.37897, 4.90042"
        autocomplete="off"
        @input="error = null"
        @keyup.enter="onApply"
      />
    </label>

    <p v-if="error" class="warn">{{ error }}</p>
    <p v-else class="hint">
      Danach zeigt das Karten-Icon einer Frage sie von hier aus — mit der Entfernung von
      deiner Position zu dem, was die Antwort entscheidet.
    </p>

    <div class="actions">
      <button type="button" class="primary" @click="onApply">Übernehmen</button>
      <button v-if="store.seekerPosition" type="button" @click="onClear">Entfernen</button>
    </div>
  </div>
</template>

<style scoped>
/* Gleiche Lage und Optik wie „Frage verschicken": über dem eingeklappten Sheet, in
   der Daumenzone. */
.seeker {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 120px;
  z-index: 560;
  padding: 12px 14px 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 6px 24px rgb(15 23 42 / 0.28);
}

.head {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
}

.close {
  margin-left: auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: none;
  color: var(--text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.field input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px; /* unter 16px zoomt iOS beim Fokus hinein */
  font-variant-numeric: tabular-nums;
}

.hint,
.warn {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.warn {
  color: var(--bad);
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.actions > * {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.actions .primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}
</style>
