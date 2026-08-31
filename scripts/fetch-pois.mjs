#!/usr/bin/env node
/**
 * Zieht die Orte aus OpenStreetMap, auf die sich die Fragekarten beziehen —
 * Museen, Bibliotheken, Kinos und so weiter.
 *
 * Der Rahmen ist bewusst grösser als das Spielgebiet: für „welches Museum ist dir
 * am nächsten?" muss auch ein Museum knapp ausserhalb der Gebietsgrenze zählen,
 * sonst bekommen die Randstationen ein falsches Ergebnis.
 *
 *   node scripts/fetch-pois.mjs
 */
import { writeFile } from 'node:fs/promises'
import { overpass, slug } from './lib/overpass.mjs'

// S, W, N, O — Spielgebiet plus rund 20 km Rand.
const BBOX = [52.0, 4.25, 52.76, 5.35]
const OUT = new URL('../public/data/poi.json', import.meta.url)

/**
 * Die Kategorien, auf die sich Matching-, Measuring- und Tentacles-Karten beziehen.
 * `reject` filtert Treffer, die zwar das Tag tragen, aber nicht gemeint sind.
 */
const CATEGORIES = [
  { id: 'museum', label: 'Museum', selector: '["tourism"="museum"]' },
  { id: 'library', label: 'Bibliothek', selector: '["amenity"="library"]' },
  { id: 'cinema', label: 'Kino', selector: '["amenity"="cinema"]' },
  { id: 'hospital', label: 'Krankenhaus', selector: '["amenity"="hospital"]' },
  { id: 'golf_course', label: 'Golfplatz', selector: '["leisure"="golf_course"]' },
  { id: 'theme_park', label: 'Freizeitpark', selector: '["tourism"="theme_park"]' },
  { id: 'aquarium', label: 'Aquarium', selector: '["tourism"="aquarium"]' },
  { id: 'consulate', label: 'Konsulat', selector: '["diplomatic"="consulate"]' },
  {
    id: 'airport',
    label: 'Flughafen',
    selector: '["aeroway"="aerodrome"]',
    // Die Karte fragt nach einem *Commercial* Airport. `aeroway=aerodrome` trifft
    // auch Segelflug- und Sportplätze, und ein ICAO-Code reicht als Merkmal nicht
    // (den hat auch ein Zweefvliegveld). Nur ein IATA-Code steht für Linienverkehr.
    reject: (tags) => !tags.iata,
  },
  {
    id: 'zoo',
    label: 'Zoo',
    selector: '["tourism"="zoo"]',
    // In den Niederlanden sind die allermeisten `tourism=zoo` Kinderbauernhöfe
    // (kinderboerderij). Von 193 Treffern sind 163 Streichelzoos — ungefiltert
    // wäre die Zoo-Frage wertlos.
    reject: (tags) => tags.zoo === 'petting_zoo',
  },
  {
    id: 'park',
    label: 'Park',
    selector: '["leisure"="park"]',
    // Ohne Namen ist es meist ein Grünstreifen, kein Park, den jemand benennen würde.
    requireName: true,
  },
]

const query = `
[out:json][timeout:300];
(
${CATEGORIES.map((c) => `  nwr${c.selector}(${BBOX.join(',')});`).join('\n')}
);
out center tags;
`

/** Ordnet ein OSM-Objekt einer Kategorie zu — die erste passende gewinnt. */
function categoryOf(tags) {
  if (tags.tourism === 'museum') return 'museum'
  if (tags.amenity === 'library') return 'library'
  if (tags.amenity === 'cinema') return 'cinema'
  if (tags.amenity === 'hospital') return 'hospital'
  if (tags.leisure === 'golf_course') return 'golf_course'
  if (tags.tourism === 'theme_park') return 'theme_park'
  if (tags.tourism === 'aquarium') return 'aquarium'
  if (tags.diplomatic === 'consulate') return 'consulate'
  if (tags.aeroway === 'aerodrome') return 'airport'
  if (tags.tourism === 'zoo') return 'zoo'
  if (tags.leisure === 'park') return 'park'
  return null
}

const raw = await overpass(query)
process.stderr.write(`${raw.elements.length} Elemente von Overpass\n`)

const byCategory = new Map(CATEGORIES.map((c) => [c.id, c]))
const pois = []
const usedIds = new Set()
const skipped = { unnamed: 0, rejected: 0, noCategory: 0, noPosition: 0 }

for (const el of raw.elements) {
  const tags = el.tags ?? {}

  const categoryId = categoryOf(tags)
  if (!categoryId) {
    skipped.noCategory++
    continue
  }
  const category = byCategory.get(categoryId)

  if (category.reject?.(tags)) {
    skipped.rejected++
    continue
  }

  const name = tags.name ?? tags['name:nl'] ?? tags['name:en']
  if (!name && category.requireName) {
    skipped.unnamed++
    continue
  }

  // Ways und Relations liefern über `out center` einen Mittelpunkt.
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (lat == null || lon == null) {
    skipped.noPosition++
    continue
  }

  let id = `${categoryId}:${slug(name ?? `${el.type}-${el.id}`)}`
  if (usedIds.has(id)) {
    let n = 2
    while (usedIds.has(`${id}-${n}`)) n++
    id = `${id}-${n}`
  }
  usedIds.add(id)

  pois.push({
    id,
    name: name ?? category.label,
    category: categoryId,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
  })
}

pois.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'nl'))

await writeFile(
  OUT,
  JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString().slice(0, 10),
      source: 'OpenStreetMap via Overpass (ODbL)',
      bbox: BBOX,
      categories: CATEGORIES.map(({ id, label }) => ({ id, label })),
      pois,
    },
    // Kompakt: die Datei wird erzeugt, nie von Hand bearbeitet. Eingerückt wäre
    // sie ohne Nutzen ein Drittel grösser.
  ) + '\n',
)

const counts = pois.reduce((acc, p) => ({ ...acc, [p.category]: (acc[p.category] ?? 0) + 1 }), {})
process.stderr.write(`\n${pois.length} Orte geschrieben\n`)
for (const { id, label } of CATEGORIES) {
  process.stderr.write(`  ${label.padEnd(14)} ${String(counts[id] ?? 0).padStart(5)}\n`)
}
process.stderr.write(
  `  übersprungen: ${skipped.rejected} gefiltert, ${skipped.unnamed} ohne Namen, ` +
    `${skipped.noPosition} ohne Position\n`,
)
