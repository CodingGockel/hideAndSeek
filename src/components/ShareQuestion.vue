<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/game'
import { useQuestionStore } from '../stores/questions'
import { buildMessage, whatsappUrl } from '../lib/share'
import type { LatLon, Question } from '../types/game'

const props = defineProps<{
  question: Question
  origin: LatLon
  radiusMeters: number | null
}>()

const emit = defineEmits<{ close: [] }>()

const game = useGameStore()
const questions = useQuestionStore()

const text = computed(() =>
  buildMessage({
    category: questions.categoryOfQuestion.get(props.question.id),
    question: props.question,
    origin: props.origin,
    radiusMeters: props.radiusMeters,
    senderName: game.senderName,
  }),
)

/** Kurze Rückmeldung, weil „Kopiert" sonst nirgends sichtbar wird. */
const note = ref<string | null>(null)

/**
 * Verschicken ist der Moment, in dem die Karte gespielt ist — das Häkchen von Hand
 * nachzuziehen vergisst man unterwegs.
 */
function markUsed() {
  if (!questions.usedIds.has(props.question.id)) questions.toggleUsed(props.question.id)
}

function onWhatsApp() {
  markUsed()
  emit('close')
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(text.value)
    note.value = 'Nachricht kopiert'
    markUsed()
  } catch {
    // Ohne Clipboard-Recht (oder ohne HTTPS) bleibt der Text im Feld — markieren geht.
    note.value = 'Kopieren nicht erlaubt — Text von Hand markieren'
  }
}

const canShare = typeof navigator !== 'undefined' && 'share' in navigator

async function onShare() {
  try {
    await navigator.share({ text: text.value })
    markUsed()
    emit('close')
  } catch {
    // Abgebrochenes Teilen ist kein Fehler.
  }
}
</script>

<template>
  <div class="share" role="dialog" aria-label="Frage verschicken">
    <div class="head">
      <strong>Frage verschicken</strong>
      <button type="button" class="close" aria-label="Schliessen" @click="emit('close')">×</button>
    </div>

    <textarea class="text" readonly rows="5" :value="text" />

    <label class="name">
      Absender
      <input
        v-model="game.senderName"
        type="text"
        inputmode="text"
        placeholder="z. B. Team Rot"
        maxlength="24"
      />
    </label>

    <p v-if="!game.userPosition" class="warn">
      Ohne Ortung wird die Kartenmitte verschickt.
    </p>
    <p v-else-if="game.isManualPosition" class="warn">Es gilt der von Hand gesetzte Standort.</p>
    <p v-if="note" class="note">{{ note }}</p>

    <div class="actions">
      <!-- Als Anker, nicht per window.open: sonst hält der Popup-Blocker den Aufruf auf. -->
      <a class="primary" :href="whatsappUrl(text)" target="_blank" rel="noopener" @click="onWhatsApp">
        WhatsApp
      </a>
      <button type="button" @click="onCopy">Kopieren</button>
      <button v-if="canShare" type="button" @click="onShare">Teilen…</button>
    </div>
  </div>
</template>

<style scoped>
/* Über dem eingeklappten Sheet statt oben auf der Karte: die Knöpfe gehören in die
   Daumenzone. Der Abstand ist dessen Peek-Höhe (108 px) plus Rand — dieselbe Rechnung
   wie bei den Knöpfen rechts unten. */
.share {
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

.text {
  display: block;
  width: 100%;
  resize: none;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-sunken);
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
}

.name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.name input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px; /* unter 16px zoomt iOS beim Fokus hinein */
}

.warn,
.note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.note {
  color: var(--accent);
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
  text-decoration: none;
  cursor: pointer;
}

.actions .primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}
</style>
