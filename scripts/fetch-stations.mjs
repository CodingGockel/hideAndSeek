#!/usr/bin/env node
/**
 * Zieht Bahn- und Metro-Stationen der Amsterdam-Region aus OpenStreetMap.
 *
 * Alle gefundenen Stationen gelten als bespielbar. Soll eine doch nicht dabei sein,
 * in stations.json `ticketValid: false` setzen — das überlebt einen erneuten Lauf,
 * genau wie `lines` und `notes`.
 *
 *   node scripts/fetch-stations.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'

// S, W, N, O — auf die Amsterdam-Region zugeschnitten. Bewusst etwas weiter als das
// Ticket reicht (Castricum, Weesp, Nieuw Vennep), damit die Grenzfälle in der Liste
// auftauchen und kuratiert werden können. Weiter gefasst zieht es Den Haag, Utrecht
// und Hoorn herein, die mit dem Ticket nicht erreichbar sind.
const BBOX = [52.2, 4.45, 52.56, 5.15]
const OUT = new URL('../public/data/stations.json', import.meta.url)

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

// Overpass verlangt einen echten User-Agent (Node schickt sonst keinen und
// bekommt 406) und ist regelmässig kurzzeitig überlastet — daher Retries.
const USER_AGENT = 'hideAndSeek/1.0 (Jet-Lag-style game map; contact via repo)'
const ROUNDS = 3

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const QUERY = `
[out:json][timeout:180];
(
  nwr["railway"="station"](${BBOX.join(',')});
  nwr["railway"="halt"](${BBOX.join(',')});
);
out center tags;
`

async function overpass() {
  let lastError
  for (let round = 1; round <= ROUNDS; round++) {
    for (const url of ENDPOINTS) {
      try {
        process.stderr.write(`→ [${round}/${ROUNDS}] ${url}\n`)
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
          body: new URLSearchParams({ data: QUERY }),
        })
        const body = await res.text()
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        // Bei Überlast antwortet Overpass mit HTTP 200 und einer HTML-Fehlerseite.
        if (!body.trimStart().startsWith('{')) {
          const hint = body.match(/Error<\/strong>: ([^<\n]+)/)?.[1] ?? 'keine JSON-Antwort'
          throw new Error(hint.trim())
        }
        return JSON.parse(body)
      } catch (err) {
        lastError = err
        process.stderr.write(`  fehlgeschlagen: ${err.message}\n`)
      }
    }
    if (round < ROUNDS) {
      const wait = round * 15
      process.stderr.write(`  alle Endpunkte belegt, warte ${wait}s\n`)
      await sleep(wait * 1000)
    }
  }
  throw lastError
}

// Museums- und Touristenbahnen sind keine spielbaren Stationen.
const EXCLUDED_OPERATOR = /stoomtrein|museum|toeristische|heritage/i

const OPERATOR_ALIASES = {
  'Gemeentelijk Vervoerbedrijf': 'GVB',
  'Gemeentevervoerbedrijf': 'GVB',
  'Nederlandse Spoorwegen': 'NS',
  'NS Reizigers': 'NS',
}

/** Stillgelegtes und im Bau befindliches raus. */
function isActive(tags) {
  if (tags.disused === 'yes' || tags.abandoned === 'yes') return false
  if (tags.construction || tags['construction:railway']) return false
  if (tags.usage === 'industrial' || tags.usage === 'tourism') return false
  if (EXCLUDED_OPERATOR.test(tags.operator ?? '')) return false
  if (EXCLUDED_OPERATOR.test(tags.name ?? '')) return false

  // Haltepunkte, die nur zu Anlässen bedient werden (Amsterdam ArenA nur bei
  // Fussballspielen), sind als Versteck wertlos — man kommt dort nicht hin.
  if (tags.seasonal === 'yes') return false

  // railway=halt trifft auch Park- und Draisinenbahnen (z.B. "Amsteltrein" im
  // Amstelpark). Echte Haltepunkte tragen mindestens ein ÖPNV-Merkmal.
  if (tags.railway === 'halt') {
    const isTransit =
      tags.operator ||
      tags.network ||
      tags.uic_ref ||
      tags['railway:ref'] ||
      tags.public_transport ||
      tags.train === 'yes'
    if (!isTransit) return false
  }

  return Object.keys(tags).every((k) => !/^(disused|abandoned|razed|proposed):/.test(k))
}

function modesOf(tags) {
  const modes = new Set()
  if (tags.station === 'subway' || tags.subway === 'yes') modes.add('metro')
  if (tags.station === 'light_rail' || tags.light_rail === 'yes') modes.add('light_rail')
  if (tags.train === 'yes') modes.add('train')
  // railway=station ohne station-Tag ist in NL praktisch immer ein NS-Bahnhof
  if (!modes.size && tags.railway === 'station') modes.add('train')
  if (!modes.size && tags.railway === 'halt') modes.add('train')
  return [...modes]
}

function operatorsOf(tags) {
  return (tags.operator ?? '')
    .split(';')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => OPERATOR_ALIASES[o] ?? o)
}

function slug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Luftlinie in Metern, Haversine. */
function distance(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const raw = await overpass()
process.stderr.write(`${raw.elements.length} Elemente von Overpass\n`)

// Ein Verkehrsknoten steckt in OSM oft in mehreren Objekten: ein Node für den Halt,
// ein Way für das Gebäude, ein eigener Node je Verkehrsmittel. Erschwerend benennt OSM
// Bahn und Metro am selben Ort unterschiedlich ("Amsterdam Centraal" vs. "Centraal
// Station"), Gruppieren nach Namen greift also nicht. Stattdessen räumlich clustern:
// alles innerhalb von MERGE_RADIUS ist derselbe Knoten. Die engste Nachbarschaft
// zweier echter Metro-Stationen in Amsterdam liegt bei rund 500 m, 300 m ist sicher.
const MERGE_RADIUS = 300

const clusters = []

for (const el of raw.elements) {
  const tags = el.tags ?? {}
  const name = tags.name ?? tags['name:nl']
  if (!name || !isActive(tags)) continue

  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (lat == null || lon == null) continue

  const modes = modesOf(tags)
  if (!modes.length) continue

  const member = {
    name,
    lat,
    lon,
    modes,
    operators: operatorsOf(tags),
    osmId: `${el.type}/${el.id}`,
  }

  const hit = clusters.find((c) => distance(c, member) < MERGE_RADIUS)
  if (hit) {
    hit.members.push(member)
  } else {
    clusters.push({ lat, lon, members: [member] })
  }
}

const MODE_ORDER = { train: 0, metro: 1, light_rail: 2 }

/**
 * NS vergibt die offiziellen, eindeutigen Bahnhofsnamen ("Amsterdam Zuid"), die
 * Metro-Namen sind Kurzformen ("Zuid"). Wo beides vorliegt, gewinnt der Bahn-Name.
 */
function pickName(members) {
  const train = members.filter((m) => m.modes.includes('train'))
  const pool = train.length ? train : members
  return pool.map((m) => m.name).sort((a, b) => b.length - a.length)[0]
}

const merged = clusters.map((c) => {
  const name = pickName(c.members)
  // Der Bahnsteig-Node trifft die Lage besser als der Gebäude-Umriss.
  const anchor = c.members.find((m) => m.modes.includes('train')) ?? c.members[0]
  return {
    name,
    lat: anchor.lat,
    lon: anchor.lon,
    modes: [...new Set(c.members.flatMap((m) => m.modes))].sort(
      (a, b) => MODE_ORDER[a] - MODE_ORDER[b],
    ),
    operators: [...new Set(c.members.flatMap((m) => m.operators))].sort(),
    osmIds: c.members.map((m) => m.osmId),
  }
})

// Vorhandene Kuratierung einlesen, damit sie einen erneuten Lauf überlebt.
let curated = new Map()
try {
  const prev = JSON.parse(await readFile(OUT, 'utf8'))
  curated = new Map(prev.stations.map((s) => [s.id, s]))
  process.stderr.write(`${curated.size} vorhandene Einträge werden übernommen\n`)
} catch {
  process.stderr.write('keine vorhandene stations.json — Neuanlage\n')
}

const usedIds = new Set()
const stations = merged.map((m) => {
  let id = slug(m.name)
  // Bei gleichem Namen an verschiedenen Orten durchnummerieren, damit IDs stabil bleiben.
  if (usedIds.has(id)) {
    let n = 2
    while (usedIds.has(`${id}-${n}`)) n++
    id = `${id}-${n}`
  }
  usedIds.add(id)

  const prev = curated.get(id)
  return {
    id,
    name: m.name,
    lat: Number(m.lat.toFixed(6)),
    lon: Number(m.lon.toFixed(6)),
    modes: m.modes,
    operators: m.operators,
    lines: prev?.lines ?? [],
    // false schliesst eine Station vom Spiel aus; Standard ist bespielbar.
    ticketValid: prev?.ticketValid ?? true,
    osmIds: m.osmIds,
    notes: prev?.notes ?? '',
  }
})

stations.sort((a, b) => a.name.localeCompare(b.name, 'nl'))

await writeFile(
  OUT,
  JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString().slice(0, 10),
      source: 'OpenStreetMap via Overpass (ODbL)',
      bbox: BBOX,
      stations,
    },
    null,
    2,
  ) + '\n',
)

const byMode = stations.reduce((acc, s) => {
  s.modes.forEach((m) => (acc[m] = (acc[m] ?? 0) + 1))
  return acc
}, {})
const excluded = stations.filter((s) => s.ticketValid === false).length

process.stderr.write(`\n${stations.length} Stationen geschrieben\n`)
process.stderr.write(`  nach Modus: ${JSON.stringify(byMode)}\n`)
process.stderr.write(`  ausgeschlossen (ticketValid: false): ${excluded}\n`)
