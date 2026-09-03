import { ref } from 'vue'

/**
 * Leaflet erwartet konkrete Farbwerte, das Farbschema steckt aber in CSS-Variablen.
 * Also einmal auslesen — die Aufrufer zeichnen bei einem Themenwechsel neu.
 */
export function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** Was tatsächlich zu sehen ist. Die Wahl kennt zusätzlich `null` — „wie das Gerät". */
export type Theme = 'light' | 'dark'

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

/**
 * Die gerade sichtbare Ansicht, aufgelöst aus Wahl und Systemeinstellung.
 *
 * Die Karte zeichnet ihre Overlays in Farben aus dem CSS und muss nach jedem Wechsel neu
 * zeichnen — egal ob ihn das Gerät oder der Knopf ausgelöst hat. Darum hängt das an einem
 * Ref und nicht mehr an einem Listener auf der Media Query.
 */
export const resolvedTheme = ref<Theme>(systemDark.matches ? 'dark' : 'light')

let choice: Theme | null = null

/**
 * Wahl anwenden: `null` überlässt die Entscheidung dem Gerät (und damit dem CSS), sonst
 * setzt `data-theme` das Farbschema fest und überstimmt `prefers-color-scheme`.
 */
export function applyTheme(next: Theme | null) {
  choice = next
  if (next) document.documentElement.dataset.theme = next
  else delete document.documentElement.dataset.theme
  resolvedTheme.value = next ?? (systemDark.matches ? 'dark' : 'light')
}

// Ohne eigene Wahl folgt die App weiter dem Gerät — auch während sie läuft.
systemDark.addEventListener('change', () => applyTheme(choice))
