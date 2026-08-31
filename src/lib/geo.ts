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

/**
 * Lokale, ebene Näherung um einen Bezugspunkt.
 *
 * Für Geometrie im Bereich weniger Kilometer ist die Erdkrümmung vernachlässigbar,
 * und in einer Ebene lassen sich Senkrechte und Mittelpunkte trivial rechnen. Weit
 * vom Bezugspunkt entfernt wächst der Fehler — für die Ränder eines Abdunkelungs-
 * Polygons ist das ohne Belang, für die Trennlinie selbst liegt der Bezugspunkt
 * genau darauf.
 */
function localFrame(origin: { lat: number; lon: number }) {
  const metersPerDegLat = 110574
  const metersPerDegLon = 111320 * Math.cos((origin.lat * Math.PI) / 180)

  return {
    toLocal(p: { lat: number; lon: number }): [number, number] {
      return [(p.lon - origin.lon) * metersPerDegLon, (p.lat - origin.lat) * metersPerDegLat]
    },
    toLatLon(x: number, y: number) {
      return {
        lat: origin.lat + y / metersPerDegLat,
        lon: origin.lon + x / metersPerDegLon,
      }
    },
  }
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
export function bisectorLine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  extentMeters = 80000,
): { lat: number; lon: number }[] {
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }
  const frame = localFrame(mid)
  const [bx, by] = frame.toLocal(b)

  const length = Math.hypot(bx, by)
  if (length === 0) return []

  // Einheitsvektor senkrecht zur Verbindung a->b.
  const px = -by / length
  const py = bx / length

  return [
    frame.toLatLon(px * extentMeters, py * extentMeters),
    frame.toLatLon(-px * extentMeters, -py * extentMeters),
  ]
}

/**
 * Die Halbebene auf der Seite von `side` — als Polygon, um sie einzufärben.
 *
 * Ein Rechteck, das an der Mittelsenkrechten beginnt und weit über das Spielgebiet
 * hinausreicht.
 */
export function halfPlanePolygon(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  side: 'a' | 'b',
  extentMeters = 80000,
): { lat: number; lon: number }[] {
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }
  const frame = localFrame(mid)
  const [bx, by] = frame.toLocal(b)

  const length = Math.hypot(bx, by)
  if (length === 0) return []

  // Entlang der Verbindung: zu b hin positiv.
  const dx = bx / length
  const dy = by / length
  // Quer dazu.
  const px = -dy
  const py = dx

  const sign = side === 'b' ? 1 : -1
  const e = extentMeters

  return [
    frame.toLatLon(px * e, py * e),
    frame.toLatLon(-px * e, -py * e),
    frame.toLatLon(-px * e + dx * e * sign, -py * e + dy * e * sign),
    frame.toLatLon(px * e + dx * e * sign, py * e + dy * e * sign),
  ]
}
