<script setup lang="ts">
import { ref } from 'vue'
import { useQuestionStore } from '../stores/questions'
import { ANSWER_LABELS, answersFor } from '../lib/share'
import type { Question } from '../types/game'

const emit = defineEmits<{
  show: [question: Question, answer: string, radiusMeters: number | null]
  preview: [question: Question | null, radiusMeters: number | null]
  share: [question: Question, radiusMeters: number | null]
}>()

const store = useQuestionStore()

// Alle Kategorien starten eingeklappt — 69 Fragen am Stück sind auf dem Handy
// nicht zu überblicken.
const collapsed = ref<Set<string>>(new Set(['matching', 'measuring', 'photos', 'tentacles']))
const answering = ref<string | null>(null)
const customRadius = ref(3000)

function toggleCategory(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

function onShow(question: Question, answer: string) {
  emit('show', question, answer, question.radiusMeters ?? customRadius.value)
  answering.value = null
}

/**
 * Antippen von „Karte" zeigt die Geometrie sofort, noch vor der Antwort — bei
 * Radar sieht man so erst einmal, wie gross der Radius überhaupt ist.
 */
function onToggleAnswering(question: Question) {
  if (answering.value === question.id) {
    answering.value = null
    emit('preview', null, null)
    return
  }
  answering.value = question.id
  emit('preview', question, question.radiusMeters ?? customRadius.value)
}

/** Beim frei gewählten Radius wächst die Vorschau beim Tippen mit. */
function onCustomRadiusChange(question: Question) {
  if (answering.value !== question.id) return
  emit('preview', question, customRadius.value)
}

/**
 * Verschicken kann man jede Karte — auch die, die auf der Karte nichts zeigt. Gerade
 * die Photos-Karten leben davon, dass der andere sie überhaupt erst zu sehen bekommt.
 */
function onShare(question: Question) {
  // Der frei gewählte Radius gilt nur für die eine Radar-Karte, die keinen mitbringt.
  // Sonst stünde er auch an einer Photos-Karte im Link und hiesse dort nichts.
  const custom = question.viz === 'radius' && question.radiusMeters == null
  emit('share', question, question.radiusMeters ?? (custom ? customRadius.value : null))
}
</script>

<template>
  <div class="questions">
    <input
      v-model="store.search"
      class="search"
      type="search"
      inputmode="search"
      placeholder="Frage suchen…"
      aria-label="Frage suchen"
    />

    <p class="summary">
      {{ store.usedCount }} von {{ store.allQuestions.length }} genutzt ·
      {{ store.drawableCount }} auf der Karte zeigbar
      <button v-if="store.usedCount" type="button" class="reset" @click="store.clearUsed()">
        zurücksetzen
      </button>
    </p>

    <section v-for="category in store.filteredCategories" :key="category.id" class="category">
      <button type="button" class="cat-head" @click="toggleCategory(category.id)">
        <span class="chevron" :class="{ open: !collapsed.has(category.id) }">›</span>
        <span class="cat-name">{{ category.name }}</span>
        <span class="cat-meta">
          {{ category.questions.length }} · {{ category.timeLimitMin }} min ·
          {{ category.cards.draw }}/{{ category.cards.keep }}
        </span>
      </button>

      <p v-if="!collapsed.has(category.id)" class="prompt">{{ category.prompt }}</p>

      <ul v-if="!collapsed.has(category.id)" class="list">
        <li v-for="question in category.questions" :key="question.id">
          <div class="row" :class="{ used: store.usedIds.has(question.id) }">
            <button
              type="button"
              class="check"
              :aria-pressed="store.usedIds.has(question.id)"
              :aria-label="`${question.label} als genutzt markieren`"
              @click="store.toggleUsed(question.id)"
            >
              <span v-if="store.usedIds.has(question.id)">✓</span>
            </button>

            <span class="label">
              {{ question.label }}
              <span v-if="question.weak" class="weak" :title="question.weak">schwach</span>
            </span>

            <button
              type="button"
              class="send"
              :aria-label="`${question.label} verschicken`"
              title="Frage mit meinem Standort verschicken"
              @click="onShare(question)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 21 23 12 2 3v7l15 2-15 2z" />
              </svg>
            </button>

            <button
              v-if="question.viz !== 'none'"
              type="button"
              class="show"
              :class="{ open: answering === question.id }"
              @click="onToggleAnswering(question)"
            >
              Karte
            </button>
            <span v-else class="no-viz" title="Nicht auf der Karte darstellbar">–</span>
          </div>

          <div v-if="answering === question.id" class="answers">
            <label v-if="question.radiusMeters == null && question.viz === 'radius'" class="custom">
              Radius
              <input
                v-model.number="customRadius"
                type="number"
                min="100"
                step="100"
                @input="onCustomRadiusChange(question)"
              />
              m
            </label>
            <p v-if="question.weak" class="weak-note">{{ question.weak }}</p>
            <div class="answer-buttons">
              <button
                v-for="answer in answersFor(category, question)"
                :key="answer"
                type="button"
                class="answer"
                @click="onShow(question, answer)"
              >
                {{ ANSWER_LABELS[answer] ?? answer }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <p v-if="!store.filteredCategories.length" class="empty">Keine Frage gefunden.</p>
  </div>
</template>

<style scoped>
.search {
  width: 100%;
  padding: 10px 12px;
  font-size: 16px; /* unter 16px zoomt iOS beim Fokus hinein */
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-sunken);
  color: inherit;
}

.summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.reset {
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

.category {
  border-top: 1px solid var(--border);
}

.cat-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.chevron {
  display: inline-block;
  width: 14px;
  color: var(--text-muted);
  transition: transform 0.15s;
}

.chevron.open {
  transform: rotate(90deg);
}

.cat-name {
  font-weight: 700;
  font-size: 15px;
}

.cat-meta {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.prompt {
  margin: 0 0 6px 22px;
  font-size: 12px;
  font-style: italic;
  color: var(--text-muted);
}

.list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding-left: 22px;
}

.row.used .label {
  color: var(--text-muted);
  text-decoration: line-through;
}

.check {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1.5px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ok);
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.row.used .check {
  border-color: var(--ok);
}

.label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}

.weak {
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
}

.show {
  flex: none;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.show.open {
  background: var(--accent);
  color: var(--on-accent);
}

/* Papierflieger statt Wort: neben Label und „Karte" ist in einer 44-px-Zeile kein
   Platz mehr für einen dritten Text. */
.send {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.send svg {
  width: 15px;
  height: 15px;
  fill: currentColor;
}

.no-viz {
  flex: none;
  width: 30px;
  text-align: center;
  color: var(--border-strong);
}

.answers {
  margin: 0 0 10px 56px;
  padding: 10px;
  border-radius: 10px;
  background: var(--surface-sunken);
}

.custom {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-muted);
}

.custom input {
  width: 90px;
  margin: 0 4px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 14px;
}

.weak-note {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.answer-buttons {
  display: flex;
  gap: 8px;
}

.answer {
  flex: 1;
  min-height: 40px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.empty {
  padding: 24px 4px;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
