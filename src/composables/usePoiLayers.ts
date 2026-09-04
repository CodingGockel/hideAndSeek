/**
 * Die Orte, die dauerhaft auf der Karte liegen — gewählt im Menü links.
 *
 * Getrennt von `usePreviewLayers`, weil die beiden Verschiedenes tun: die Vorschau zeigt
 * *eine* Kategorie und beantwortet eine Frage (nächster Ort, Linie dorthin), dieses
 * Overlay zeigt *beliebig viele* und behauptet gar nichts. Es liegt unter der Vorschau
 * und weicht ihr aus, sobald sie dieselbe Kategorie zeichnet — zwei Pins übereinander
 * verdecken sonst ausgerechnet den hervorgehobenen.
 */
import { watch, type Ref } from 'vue'
import L from 'leaflet'
import { useGameStore } from '../stores/game'
import { useQuestionStore } from '../stores/questions'
import { poiPin } from '../lib/poiPin'
import { cssColor, resolvedTheme } from '../lib/theme'

export function usePoiLayers(map: Ref<L.Map | null>) {
  const game = useGameStore()
  const questions = useQuestionStore()

  let group: L.LayerGroup | null = null

  /**
   * Die Kategorie, die gerade eine Frage zeigt — sie gehört der Vorschau.
   *
   * Die Kategorie und nicht der Visualisierungstyp entscheidet: `poi-nearest`,
   * `poi-within` und `poi-isodistance` zeichnen alle drei Orte, und umgekehrt trägt
   * keine Frage ohne Orte eine Kategorie. Auf den Typ zu prüfen hiesse, ihn hier und
   * im Dispatch von usePreviewLayers doppelt zu pflegen.
   */
  function previewCategory(): string | null {
    return questions.preview?.poiCategory ?? null
  }

  function draw() {
    group?.remove()
    group = null
    if (!map.value) return

    const skip = previewCategory()
    const color = cssColor('--preview', '#1e293b')

    const layers: L.Layer[] = []
    for (const id of game.activePoiCategories) {
      if (id === skip) continue
      for (const poi of questions.poisByCategory.get(id) ?? []) {
        layers.push(poiPin(poi, color))
      }
    }

    if (layers.length) group = L.layerGroup(layers).addTo(map.value)
  }

  function bind() {
    draw()
    watch(() => game.activePoiCategories, draw)
    // Erst nach dem Laden von poi.json gibt es überhaupt Orte zu zeichnen.
    watch(() => questions.poisByCategory, draw)
    watch(previewCategory, draw)
    // Die Farbe kommt aus dem CSS und ändert sich mit der Ansicht.
    watch(resolvedTheme, draw)
  }

  return { bind }
}
