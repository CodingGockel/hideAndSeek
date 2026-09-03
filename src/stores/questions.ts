import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  LatLon,
  MapPreview,
  Poi,
  PoiFile,
  Question,
  QuestionCategory,
  QuestionsFile,
} from '../types/game'

const BASE = import.meta.env.BASE_URL
const USED_KEY = 'hs.usedQuestions.v1'

/**
 * Bis V4 lagen hier die beantworteten Fragen als dauerhafte „Einschränkungen". Der
 * Schlüssel wird beim Start einmal geräumt, sonst bliebe der Altbestand für immer im
 * Speicher liegen.
 */
const LEGACY_CONSTRAINTS_KEY = 'hs.constraints.v1'

function loadJson<T>(file: string): Promise<T> {
  return fetch(`${BASE}data/${file}`).then((res) => {
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
    return res.json()
  })
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    // Privater Modus oder blockierter Storage.
    return fallback
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nicht verfügbar — gilt dann nur für diese Sitzung.
  }
}

export const useQuestionStore = defineStore('questions', () => {
  const categories = ref<QuestionCategory[]>([])
  const pois = ref<Poi[]>([])
  const poiCategories = ref<{ id: string; label: string }[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  const usedIds = ref<Set<string>>(new Set(readStored<string[]>(USED_KEY, [])))
  const search = ref('')

  try {
    localStorage.removeItem(LEGACY_CONSTRAINTS_KEY)
  } catch {
    // Privater Modus oder blockierter Storage — dann liegt dort ohnehin nichts.
  }

  /**
   * Die Geometrie der Frage, über die gerade geredet wird. Höchstens eine, nie
   * gespeichert: sie zeigt, worüber die Frage redet, und verschwindet wieder.
   */
  const preview = ref<MapPreview | null>(null)

  /**
   * Eine Frage, die per Link hereingekommen ist. Die Geometrie dazu liegt als
   * `preview` — gespeichert wird sie nicht, denn sie gehört dem Fragenden, nicht uns.
   * Hier steht nur, was das Overlay an Text braucht.
   */
  const incoming = ref<{
    questionId: string
    senderName: string
    /** Standort des Fragenden. Steht auch hier, weil Karten ohne Geometrie
     *  („Photos") keine Vorschau anlegen, der Punkt aber trotzdem gezeigt wird. */
    origin: LatLon
    radiusMeters: number | null
  } | null>(null)

  watch(usedIds, () => writeStored(USED_KEY, [...usedIds.value]), { deep: true })

  const allQuestions = computed(() => categories.value.flatMap((c) => c.questions))

  const questionById = computed(() => new Map(allQuestions.value.map((q) => [q.id, q])))

  const categoryOfQuestion = computed(() => {
    const map = new Map<string, QuestionCategory>()
    for (const category of categories.value) {
      for (const question of category.questions) map.set(question.id, category)
    }
    return map
  })

  /** Kategorien mit auf den Suchbegriff gefilterten Fragen; leere fallen raus. */
  const filteredCategories = computed(() => {
    const q = search.value.trim().toLowerCase()
    if (!q) return categories.value
    return categories.value
      .map((category) => ({
        ...category,
        questions: category.questions.filter(
          (question) =>
            question.label.toLowerCase().includes(q) ||
            category.name.toLowerCase().includes(q),
        ),
      }))
      .filter((category) => category.questions.length > 0)
  })

  const poisByCategory = computed(() => {
    const map = new Map<string, Poi[]>()
    for (const poi of pois.value) {
      const list = map.get(poi.category)
      if (list) list.push(poi)
      else map.set(poi.category, [poi])
    }
    return map
  })

  const usedCount = computed(() => usedIds.value.size)
  const drawableCount = computed(() => allQuestions.value.filter((q) => q.viz !== 'none').length)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [questionsFile, poiFile] = await Promise.all([
        loadJson<QuestionsFile>('questions.json'),
        loadJson<PoiFile>('poi.json'),
      ])
      categories.value = questionsFile.categories
      pois.value = poiFile.pois
      poiCategories.value = poiFile.categories
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  function toggleUsed(id: string) {
    const next = new Set(usedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    usedIds.value = next
  }

  function clearUsed() {
    usedIds.value = new Set()
  }

  /** Geometrie einer Frage zeigen. */
  function setPreview(
    question: Question,
    origin: LatLon,
    radiusMeters: number | null,
  ): MapPreview | null {
    if (question.viz === 'none') {
      preview.value = null
      return null
    }

    preview.value = {
      id: '__preview',
      questionId: question.id,
      categoryId: categoryOfQuestion.value.get(question.id)?.id ?? '',
      label: question.label,
      viz: question.viz,
      origin,
      radiusMeters: radiusMeters ?? question.radiusMeters ?? null,
      poiCategory: question.poiCategory,
      createdAt: Date.now(),
    }
    return preview.value
  }

  function clearPreview() {
    preview.value = null
    incoming.value = null
  }

  /**
   * Eine per Link erhaltene Frage anzeigen.
   *
   * Wie `setPreview`, nur mit `compareToUser`: das schaltet die gestrichelten
   * Vergleichslinien von der eigenen Position zu den Punkten frei, die die Antwort
   * entscheiden.
   */
  function setIncoming(
    question: Question,
    origin: LatLon,
    radiusMeters: number | null,
    senderName: string,
  ): MapPreview | null {
    incoming.value = { questionId: question.id, senderName, origin, radiusMeters }

    if (question.viz === 'none') {
      preview.value = null
      return null
    }

    preview.value = {
      id: '__preview',
      questionId: question.id,
      categoryId: categoryOfQuestion.value.get(question.id)?.id ?? '',
      label: question.label,
      viz: question.viz,
      origin,
      radiusMeters: radiusMeters ?? question.radiusMeters ?? null,
      poiCategory: question.poiCategory,
      createdAt: Date.now(),
      compareToUser: true,
      senderName,
    }
    return preview.value
  }

  return {
    categories,
    pois,
    poiCategories,
    loading,
    error,
    usedIds,
    search,
    preview,
    incoming,
    allQuestions,
    questionById,
    categoryOfQuestion,
    filteredCategories,
    poisByCategory,
    usedCount,
    drawableCount,
    setPreview,
    setIncoming,
    clearPreview,
    load,
    toggleUsed,
    clearUsed,
  }
})
