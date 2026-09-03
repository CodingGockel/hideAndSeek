/** Luftlinie zwischen zwei Punkten in Metern (Haversine). */
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** "240 m" bzw. "3,4 km" — auf dem Handy will niemand 3417,82 m lesen. */
export function formatDistance(meters: number | null): string {
  if (meters == null) return '–'
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

/** Der nächstgelegene Eintrag samt Entfernung, oder null bei leerer Liste. */
export function nearest<T extends { lat: number; lon: number }>(
  from: { lat: number; lon: number },
  candidates: T[],
): { item: T; distance: number } | null {
  let best: { item: T; distance: number } | null = null
  for (const item of candidates) {
    const distance = distanceMeters(from, item)
    if (!best || distance < best.distance) best = { item, distance }
  }
  return best
}

/**
 * Die Mittelsenkrechte zwischen zwei Punkten als Strecke.
 *
 * Beim Thermometer trennt sie die Punkte, die näher an `a` liegen, von denen näher
 * an `b` — genau die Aussage von „wärmer oder kälter".
 */
