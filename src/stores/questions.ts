import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  Constraint,
  LatLon,
  Poi,
  PoiFile,
  Question,
  QuestionCategory,
  QuestionsFile,
  VizKind,
} from '../types/game'

const BASE = import.meta.env.BASE_URL
const USED_KEY = 'hs.usedQuestions.v1'
const CONSTRAINTS_KEY = 'hs.constraints.v1'

/**
 * Farben für die Einschränkungen. Da mehrere gleichzeitig auf der Karte liegen,
 * müssen sie sich sowohl voneinander als auch von den Stationsfarben (Blau, Orange)
 * unterscheiden.
 */
const PALETTE = ['#0d9488', '#9333ea', '#db2777', '#65a30d', '#0284c7', '#ea580c']

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
  const constraints = ref<Constraint[]>(readStored<Constraint[]>(CONSTRAINTS_KEY, []))
  const search = ref('')

  watch(usedIds, () => writeStored(USED_KEY, [...usedIds.value]), { deep: true })
  watch(constraints, () => writeStored(CONSTRAINTS_KEY, constraints.value), { deep: true })

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
  const visibleConstraints = computed(() => constraints.value.filter((c) => c.visible))

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

  /** Nächstgelegene Farbe, die noch frei ist — sonst reihum. */
  function nextColor(): string {
    const taken = new Set(constraints.value.map((c) => c.color))
    return PALETTE.find((color) => !taken.has(color)) ?? PALETTE[constraints.value.length % PALETTE.length]
  }

  function addConstraint(
    question: Question,
    origin: LatLon,
    answer: string,
    options: { target?: LatLon; radiusMeters?: number | null } = {},
  ): Constraint {
    const constraint: Constraint = {
      id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      questionId: question.id,
      categoryId: categoryOfQuestion.value.get(question.id)?.id ?? '',
      label: question.label,
      viz: question.viz as VizKind,
      origin,
      target: options.target,
      radiusMeters: options.radiusMeters ?? question.radiusMeters ?? null,
      poiCategory: question.poiCategory,
      answer,
      visible: true,
      color: nextColor(),
      createdAt: Date.now(),
    }
    constraints.value = [...constraints.value, constraint]
    return constraint
  }

  /**
   * Die erste Thermometer-Einschränkung, der noch der zweite Punkt fehlt.
   * Solange es sie gibt, wartet die Karte auf einen Tap.
   */
  const awaitingTarget = computed(
    () => constraints.value.find((c) => c.viz === 'halfplane' && !c.target) ?? null,
  )

  /** Bezugspunkt oder Zielpunkt einer Einschränkung verschieben. */
  function setConstraintPoint(id: string, which: 'origin' | 'target', point: LatLon) {
    constraints.value = constraints.value.map((c) =>
      c.id === id ? { ...c, [which]: point } : c,
    )
  }

  function removeConstraint(id: string) {
    constraints.value = constraints.value.filter((c) => c.id !== id)
  }

  function toggleConstraintVisible(id: string) {
    constraints.value = constraints.value.map((c) =>
      c.id === id ? { ...c, visible: !c.visible } : c,
    )
  }

  function clearConstraints() {
    constraints.value = []
  }

  return {
    categories,
    pois,
    poiCategories,
    loading,
    error,
    usedIds,
    constraints,
    search,
    allQuestions,
    questionById,
    categoryOfQuestion,
    filteredCategories,
    poisByCategory,
    usedCount,
    drawableCount,
    visibleConstraints,
    awaitingTarget,
    setConstraintPoint,
    load,
    toggleUsed,
    clearUsed,
    addConstraint,
    removeConstraint,
    toggleConstraintVisible,
    clearConstraints,
  }
})
