export type TransportMode = 'train' | 'metro' | 'tram' | 'bus' | 'ferry'

export interface Station {
  id: string
  name: string
  /** Zweitname aus der Quelle ("Centraal Station"), damit die Suche ihn findet */
  aliases: string[]
  lat: number
  lon: number
  /** Das Verkehrsmittel, wegen dem der Halt in der Liste steht — danach wird gefiltert */
  mode: TransportMode
  /** Bedienende Linien je Verkehrsmittel; leere Verkehrsmittel fehlen */
  lines: Partial<Record<TransportMode, string[]>>
  /** Bahnhof im Sinn der Frage „nächster Bahnhof" */
  isStation: boolean
  /** Mit dem Ticket erreichbar, aber nur gegen Aufpreis */
  extraCost: boolean
  /** false schliesst den Halt vom Spiel aus */
  ticketValid: boolean
  notes: string
}

export interface StationsFile {
  version: number
  generatedAt: string
  source: string
  stations: Station[]
}

export interface Basemap {
  id: string
  label: string
  url: string
  attribution: string
  maxZoom: number
  /**
   * Luftbild o.ä. — solche Kacheln dürfen im Dark Mode nicht invertiert werden,
   * sonst wird aus dem Foto ein Negativ.
   */
  photo: boolean
}

export interface ModeStyle {
  label: string
  color: string
}

export interface AppConfig {
  /** Radius um einen Halt, innerhalb dessen man sich verstecken darf */
  hidingRadiusMeters: number
  map: {
    center: [number, number]
    zoom: number
    minZoom: number
    maxZoom: number
  }
  basemaps: Basemap[]
  modes: Record<TransportMode, ModeStyle>
}

/** Halt mit auf die aktuelle Position bezogenen Angaben. */
export interface StationWithDistance extends Station {
  /** Luftlinie in Metern, null solange keine Position bekannt ist */
  distance: number | null
  /** Liegt die aktuelle Position im Versteck-Radius dieses Halts? */
  withinHidingRadius: boolean
}

// ---------------------------------------------------------------------------
// Fragekarten und ihre Visualisierung
// ---------------------------------------------------------------------------

export interface LatLon {
  lat: number
  lon: number
}

/**
 * Wie eine Frage auf der Karte dargestellt wird.
 *
 * - `radius`          Kreis um den Standort (Radar)
 * - `poi-within`      Kreis plus die Orte darin (Tentacles)
 * - `poi-nearest`     alle Orte der Kategorie, der nächstgelegene hervorgehoben (Matching)
 * - `poi-isodistance` dasselbe Bild wie `poi-nearest` (Measuring). Früher standen hier
 *                     gleich grosse Kreise um alle Orte, deren Vereinigung die Antwort
 *                     „näher" war — ohne Ja/Nein gibt es nichts mehr einzufärben, und
 *                     zum Spielen zählen die Orte selbst. Der eigene Wert bleibt, weil
 *                     die Frage eine andere ist: Abstand statt Identität.
 * - `none`            nicht zeichenbar, nur abhakbar (Photos, Thermometer, Grenzen)
 */
export type VizKind = 'radius' | 'poi-within' | 'poi-nearest' | 'poi-isodistance' | 'none'

export interface Question {
  id: string
  label: string
  viz: VizKind
  poiCategory: string | null
  radiusMeters?: number | null
  /** Gesetzt, wenn die Frage mit den vorhandenen Daten kaum etwas aussagt. */
  weak: string | null
}

export interface QuestionCategory {
  id: string
  name: string
  prompt: string
  answers: string[]
  timeLimitMin: number
  cards: { draw: number; keep: number }
  questions: Question[]
}

export interface QuestionsFile {
  version: number
  generatedAt: string
  game: string
  size: string
  categories: QuestionCategory[]
}

export interface Poi {
  id: string
  name: string
  category: string
  lat: number
  lon: number
}

export interface PoiFile {
  version: number
  generatedAt: string
  categories: { id: string; label: string }[]
  pois: Poi[]
}

/**
 * Eine Frage als Geometrie auf der Karte.
 *
 * Es liegt immer höchstens eine davon auf der Karte: sie zeigt, worüber die Frage
 * redet, und verschwindet wieder. Beantwortet wird im Chat — in der App bleibt vom
 * Spielstand nur das Häkchen „genutzt".
 *
 * `origin` wird beim Anlegen eingefroren: die Frage wurde von einem bestimmten Ort
 * aus gestellt. Mit der Live-Position würde der Kreis mitwandern und seine Aussage
 * verlieren.
 */
export interface MapPreview {
  id: string
  questionId: string
  categoryId: string
  label: string
  viz: VizKind
  origin: LatLon
  radiusMeters?: number | null
  poiCategory?: string | null
  createdAt: number
  /**
   * Die Frage kam von jemand anderem: zusätzlich zur Geometrie werden gestrichelte
   * Linien von der eigenen Position zu den Punkten gezogen, die die Antwort
   * entscheiden. Ein Flag und keine Koordinate, damit die Linien dem GPS folgen.
   */
  compareToUser?: boolean
  /** Wer gefragt hat — für den Tooltip am fremden Standort. */
  senderName?: string
}
