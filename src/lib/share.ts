import type { LatLon, Question, QuestionCategory } from '../types/game'

/**
 * Fragen verschicken und wieder einlesen.
 *
 * Fast jede Karte fragt nach dem Verhältnis zweier Standorte — ohne die Koordinaten
 * des Suchers ist sie nicht zu beantworten. Der Chat ist dafür der falsche Ort:
 * Koordinaten abtippen geht unterwegs schief. Also baut die App die Nachricht selbst
 * und legt einen Link bei, der die Frage beim Empfänger wieder aufmacht.
 */

/** Schema-Version im Link. Ältere Links sollen nicht stumm falsch gelesen werden. */
const LINK_VERSION = '1'

/**
 * Fünf Nachkommastellen sind gut 1 m — genauer als jedes Handy-GPS und kurz genug,
 * dass die URL in einer Chat-Zeile bleibt.
 */
const COORD_DIGITS = 5

/** "2 km" bzw. "500 m" — die Schreibweise der Radar-Karten. */
function radiusLabel(meters: number | null | undefined): string {
  if (!meters) return '?'
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  const rounded = Math.round(km * 10) / 10
  return `${String(rounded).replace('.', ',')} km`
}

/**
 * Tentacles-Labels tragen den Radius schon im Namen ("Museums (1,6 km)"). Im Satz
 * steht er an anderer Stelle, sonst hiesse es zweimal dasselbe.
 */
function withoutParens(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '')
}

/**
 * Deutscher Satzrahmen je Kategorie.
 *
 * Die Kartennamen bleiben englisch: sie stehen so auf den physischen Karten, und wer
 * am Tisch „Commercial Airport" liest, soll im Chat dasselbe wiederfinden.
 *
 * Deshalb steht der Name in Anführungszeichen vorne und der Satz kommt ohne Artikel
 * darauf aus. Eingesetzt ergäbe sich sonst „dein nächster Rail Station" oder „welchem
 * Museums" — die englischen Labels haben weder Genus noch verlässlichen Numerus.
 */
const PROMPTS_DE: Record<string, (label: string, radiusMeters: number | null) => string> = {
  radar: (_label, radius) => `Bist du im Umkreis von ${radiusLabel(radius)} um mich?`,
  matching: (label) => `„${label}" — ist der nächstgelegene bei dir derselbe wie bei mir?`,
  measuring: (label) => `„${label}" — bist du näher dran als ich oder weiter weg?`,
  tentacles: (label, radius) =>
    `„${withoutParens(label)}" im Umkreis von ${radiusLabel(radius)} um mich — welchem bist du am nächsten? (Du musst selbst auch im Umkreis sein.)`,
  thermometer: (_label, radius) =>
    `Ich bin ${radiusLabel(radius)} gefahren — bin ich wärmer oder kälter?`,
  photos: (label) => `Schick mir ein Foto von: ${label}`,
}

/**
 * Der Fragesatz, wie er in der Nachricht und beim Empfänger steht.
 *
 * Ohne passenden Rahmen bleibt `category.prompt` aus den Daten — englisch, aber
 * immer noch eine vollständige Frage. Eine neue Kategorie in `questions.json` soll
 * nicht dazu führen, dass gar nichts mehr herauskommt.
 */
export function promptFor(
  category: QuestionCategory | undefined,
  question: Question,
  radiusMeters: number | null,
): string {
  const build = category && PROMPTS_DE[category.id]
  if (build) return build(question.label, radiusMeters ?? question.radiusMeters ?? null)
  const fallback = category?.prompt ?? '{X}'
  return fallback.replace(/\{X\}/g, question.label).replace(/\{radius\}/g, radiusLabel(radiusMeters))
}

function formatCoord(value: number): string {
  return value.toFixed(COORD_DIGITS)
}

export function formatLatLon(point: LatLon): string {
  return `${formatCoord(point.lat)}, ${formatCoord(point.lon)}`
}

/** Der Standort als Punkt in einer beliebigen Karten-App. */
export function mapsUrl(point: LatLon): string {
  return `https://www.google.com/maps?q=${formatCoord(point.lat)},${formatCoord(point.lon)}`
}

export interface AskLink {
  questionId: string
  origin: LatLon
  radiusMeters: number | null
  senderName: string
}

/**
 * Die App-Adresse, unter der wir gerade laufen.
 *
 * `BASE_URL` ist in Produktion `/hideAndSeek/` (GitHub Pages, siehe vite.config.ts) und
 * im Dev-Server `/`. Beides muss im Link stehen, sonst führt er ins Leere.
 */
function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}

/**
 * Der Link, der die Frage beim Empfänger wieder aufmacht.
 *
 * Alles steckt im Fragment, nicht im Query-String: so braucht der statische Host keine
 * Umschreibregel, und die Koordinaten stehen in keinem Server-Log.
 */
export function buildAskUrl(link: AskLink): string {
  const params = new URLSearchParams()
  params.set('v', LINK_VERSION)
  params.set('q', link.questionId)
  params.set('o', `${formatCoord(link.origin.lat)},${formatCoord(link.origin.lon)}`)
  if (link.radiusMeters) params.set('r', String(Math.round(link.radiusMeters)))
  if (link.senderName.trim()) params.set('n', link.senderName.trim())
  return `${appBaseUrl()}#${params.toString()}`
}

/** Ein Punkt aus "lat,lon", oder null wenn daraus keine Koordinate wird. */
function parseLatLon(raw: string | null): LatLon | null {
  if (!raw) return null
  const [latRaw, lonRaw] = raw.split(',')
  const lat = Number(latRaw)
  const lon = Number(lonRaw)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

/**
 * Den Link wieder auseinandernehmen. Alles, was nicht passt, ergibt `null` — ein
 * halb gelesener Link wäre schlimmer als gar keiner, weil er eine Geometrie an der
 * falschen Stelle zeichnen würde.
 */
export function parseAskHash(hash: string): AskLink | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null

  const params = new URLSearchParams(raw)
  if (params.get('v') !== LINK_VERSION) return null

  const questionId = params.get('q')
  const origin = parseLatLon(params.get('o'))
  if (!questionId || !origin) return null

  const radius = Number(params.get('r'))

  return {
    questionId,
    origin,
    radiusMeters: Number.isFinite(radius) && radius > 0 ? radius : null,
    senderName: params.get('n') ?? '',
  }
}

export interface MessageInput {
  category: QuestionCategory | undefined
  question: Question
  origin: LatLon
  radiusMeters: number | null
  senderName: string
}

/**
 * Die fertige Nachricht.
 *
 * Vier Zeilen, jede mit einem eigenen Zweck: wer fragt und was, wo der Fragende steht,
 * derselbe Punkt für alle ohne die App, und der Link für alle mit ihr.
 */
export function buildMessage(input: MessageInput): string {
  const { category, question, origin, radiusMeters, senderName } = input
  const who = senderName.trim()
  const categoryName = category?.name ?? 'Frage'

  return [
    who ? `${who} fragt — ${categoryName}` : categoryName,
    promptFor(category, question, radiusMeters),
    `Mein Standort: ${formatLatLon(origin)}`,
    mapsUrl(origin),
    `In der App beantworten: ${buildAskUrl({
      questionId: question.id,
      origin,
      radiusMeters,
      senderName: who,
    })}`,
  ].join('\n')
}

/**
 * WhatsApp mit vorbefülltem Text.
 *
 * `wa.me` ohne Nummer öffnet die Chat-Auswahl — eine feste Gruppe lässt sich nicht
 * verlinken, WhatsApp kennt dafür keine Adresse.
 */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
