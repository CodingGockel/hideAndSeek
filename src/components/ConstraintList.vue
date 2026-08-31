<script setup lang="ts">
import { useQuestionStore } from '../stores/questions'
import { formatDistance } from '../lib/geo'

const emit = defineEmits<{ focus: [id: string] }>()
const store = useQuestionStore()

const ANSWER_LABELS: Record<string, string> = {
  yes: 'Ja',
  no: 'Nein',
  closer: 'Näher',
  further: 'Weiter',
  hotter: 'Wärmer',
  colder: 'Kälter',
  within: 'Orte im Umkreis',
}
</script>

<template>
  <section v-if="store.constraints.length" class="constraints">
    <header>
      <h3>Auf der Karte</h3>
      <button type="button" class="clear" @click="store.clearConstraints()">alle entfernen</button>
    </header>

    <ul>
      <li v-for="constraint in store.constraints" :key="constraint.id" class="row">
        <button
          type="button"
          class="dot"
          :class="{ off: !constraint.visible }"
          :style="{ '--dot': constraint.color }"
          :aria-label="constraint.visible ? 'Ausblenden' : 'Einblenden'"
          @click="store.toggleConstraintVisible(constraint.id)"
        />

        <button type="button" class="info" @click="emit('focus', constraint.id)">
          <span class="label">{{ constraint.label }}</span>
          <span class="meta">
            {{ ANSWER_LABELS[constraint.answer] ?? constraint.answer }}
            <template v-if="constraint.viz === 'radius' && constraint.radiusMeters">
              · {{ formatDistance(constraint.radiusMeters) }}
            </template>
            <template v-if="constraint.viz === 'halfplane' && !constraint.target">
              · zweiten Punkt antippen
            </template>
          </span>
        </button>

        <button
          type="button"
          class="remove"
          aria-label="Entfernen"
          @click="store.removeConstraint(constraint.id)"
        >
          ×
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.constraints {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

h3 {
  margin: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.clear {
  margin-left: auto;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
}

.dot {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid var(--dot);
  border-radius: 50%;
  background: var(--dot);
  cursor: pointer;
}

/* Ausgeblendet: nur der Umriss bleibt, die Zuordnung zur Farbe geht nicht verloren. */
.dot.off {
  background: transparent;
}

.info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 1px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.label {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: 12px;
  color: var(--text-muted);
}

.remove {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
</style>
