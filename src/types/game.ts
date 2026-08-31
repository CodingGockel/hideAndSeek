export type TransportMode = 'train' | 'metro' | 'light_rail'

export interface Station {
  id: string
  name: string
  lat: number
  lon: number
  modes: TransportMode[]
  operators: string[]
  lines: string[]
  /** false schliesst die Station vom Spiel aus */
  ticketValid: boolean
  osmIds: string[]
  notes: string
}

export interface StationsFile {
  version: number
  generatedAt: string
  source: string
  bbox: [number, number, number, number]
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
  /** Radius um eine Station, innerhalb dessen man sich verstecken darf */
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

/** Station mit auf die aktuelle Position bezogenen Angaben. */
export interface StationWithDistance extends Station {
  /** Luftlinie in Metern, null solange keine Position bekannt ist */
  distance: number | null
  /** Liegt die aktuelle Position im Versteck-Radius dieser Station? */
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
 * - `halfplane`       Mittelsenkrechte zwischen zwei Punkten (Thermometer)
 * - `poi-within`      Kreis plus die Orte darin (Tentacles)
 * - `poi-nearest`     alle Orte der Kategorie, der nächstgelegene hervorgehoben (Matching)
 * - `poi-isodistance` gleich grosse Kreise um alle Orte der Kategorie (Measuring):
 *                     die Vereinigung ist genau der Bereich, der näher an einem Ort
 *                     liegt als der Fragende
 * - `none`            nicht zeichenbar, nur abhakbar (Photos, Grenzen, Höhen)
 */
export type VizKind =
  | 'radius'
  | 'halfplane'
  | 'poi-within'
  | 'poi-nearest'
  | 'poi-isodistance'
  | 'none'

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
 * Eine gestellte und beantwortete Frage, als Geometrie auf der Karte.
 *
 * `origin` wird beim Anlegen eingefroren: die Frage wurde von einem bestimmten Ort
 * aus gestellt. Mit der Live-Position würde der Kreis mitwandern und seine Aussage
 * verlieren.
 */
export interface Constraint {
  id: string
  questionId: string
  categoryId: string
  label: string
  viz: VizKind
  origin: LatLon
  /** Zweiter Punkt beim Thermometer: wohin gefahren wurde. */
  target?: LatLon
  radiusMeters?: number | null
  poiCategory?: string | null
  answer: string
  visible: boolean
  color: string
  createdAt: number
}
