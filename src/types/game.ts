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
