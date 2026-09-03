<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { useQuestionStore } from '../stores/questions'
import { formatLatLon, mapsUrl, promptFor } from '../lib/share'
import { distanceMeters, formatDistance, nearest } from '../lib/geo'

const emit = defineEmits<{ locate: [] }>()

const game = useGameStore()
const questions = useQuestionStore()

const question = computed(() =>
  questions.incoming ? (questions.questionById.get(questions.incoming.questionId) ?? null) : null,
)

const category = computed(() =>
  question.value ? (questions.categoryOfQuestion.get(question.value.id) ?? undefined) : undefined,
)

const sentence = computed(() =>
  question.value
    ? promptFor(category.value, question.value, questions.incoming?.radiusMeters ?? null)
    : '',
)

const who = computed(() => questions.incoming?.senderName.trim() || 'Die Sucher')

/** Entfernung zum Fragenden — bei Radar ist sie schon die ganze Antwort. */
const distance = computed(() => {
  const position = game.userPosition
  const origin = questions.incoming?.origin
  if (!position || !origin) return null
  return distanceMeters(position, origin)
})

/**
 * Bei Tentacles ist ein Ortsname die Antwort, keine Seite eines Knopfpaars. Die Karte
 * zeigt ihn zwar am Marker, aber im Chat muss er getippt werden — also hier im Klartext.
 */
const nearestWithin = computed(() => {
  const incoming = questions.incoming
  const position = game.userPosition
  if (!incoming || !position || question.value?.viz !== 'poi-within') return null

  const radius = incoming.radiusMeters ?? question.value.radiusMeters
  const pois = question.value.poiCategory
    ? (questions.poisByCategory.get(question.value.poiCategory) ?? [])
    : []
  if (!radius || !pois.length) return null

  const inside = pois.filter((poi) => distanceMeters(incoming.origin, poi) <= radius)
  const closest = nearest(position, inside)
  return closest ? { name: closest.item.name, distance: closest.distance } : null
})

</script>

<template>
  <section v-if="question" class="incoming">
    <div class="head">
      <span class="from">{{ who }} fragt</span>
      <button type="button" class="close" aria-label="Schliessen" @click="questions.clearPreview()">
        ×
      </button>
    </div>

    <p class="sentence">{{ sentence }}</p>

    <p class="where">
      <a :href="mapsUrl(questions.incoming!.origin)" target="_blank" rel="noopener">
        {{ formatLatLon(questions.incoming!.origin) }}
      </a>
      <span v-if="distance !== null" class="gap">· {{ formatDistance(distance) }} von dir</span>
    </p>

    <p v-if="!game.userPosition" class="hint">
      Ohne eigenen Standort gibt es nichts zu vergleichen.
      <button type="button" @click="emit('locate')">Ortung an</button>
    </p>

    <p v-if="nearestWithin" class="answer-hint">
      Dir am nächsten im Umkreis: <strong>{{ nearestWithin.name }}</strong>
      ({{ formatDistance(nearestWithin.distance) }})
    </p>
  </section>
</template>

<style scoped>
.incoming {
  margin-bottom: 12px;
  padding: 10px 12px 12px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  background: var(--accent-soft);
}

.head {
  display: flex;
  align-items: center;
}

.from {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--accent);
}

.close {
  margin-left: auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.sentence {
  margin: 2px 0 6px;
  font-size: 15px;
  font-weight: 600;
}

.where {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.where a {
  color: inherit;
}

.gap {
  margin-left: 4px;
}

.hint,
.answer-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 8px 0 0;
  font-size: 13px;
}

.hint {
  color: var(--text-muted);
}

.hint button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>
