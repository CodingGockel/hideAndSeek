/**
 * Was die Beschaffungsskripte an GeoJSON gemeinsam haben.
 *
 * Die Quellen liefern Koordinaten mit fünfzehn Nachkommastellen und mehr Stützpunkten,
 * als eine Karte auf einem Handy je auflöst. Beides kostet nur Bytes.
 */
import simplify from '@turf/simplify'

/** Meter in Grad — die Toleranz von @turf/simplify rechnet in Koordinateneinheiten. */
const METERS_PER_DEGREE = 111_320

/**
 * Koordinaten auf 5 Nachkommastellen — gut 1 m, dieselbe Genauigkeit wie im
 * Link-Schema (`COORD_DIGITS` in src/lib/share.ts).
 */
export function roundCoords(coords) {
  if (typeof coords[0] === 'number') {
    return [Number(coords[0].toFixed(5)), Number(coords[1].toFixed(5))]
  }
  return coords.map(roundCoords)
}

/** Zählt die Stützpunkte — für die Zusammenfassung, die jedes Skript am Ende ausgibt. */
export function countPoints(coords) {
  if (typeof coords[0] === 'number') return 1
  return coords.reduce((sum, c) => sum + countPoints(c), 0)
}

/**
 * Ausdünnen und runden in einem Schritt.
 *
 * `mutate` ist erlaubt: die Eingabe kommt frisch aus der Antwort und wird danach
 * nicht mehr gebraucht.
 */
export function thin(geometry, toleranceMeters) {
  const simplified = simplify(
    { type: 'Feature', properties: {}, geometry },
    { tolerance: toleranceMeters / METERS_PER_DEGREE, highQuality: false, mutate: true },
  )
  return { type: simplified.geometry.type, coordinates: roundCoords(simplified.geometry.coordinates) }
}
