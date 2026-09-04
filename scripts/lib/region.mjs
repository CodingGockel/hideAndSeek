/**
 * Die Rahmen, in denen Daten beschafft werden.
 *
 * Beide sind grösser als das Spielgebiet, aber unterschiedlich gross — und sie müssen
 * an einer Stelle stehen, sonst laufen sie bei der nächsten Änderung auseinander.
 *
 * Das Spielgebiet selbst (public/data/area.geojson, die konvexe Hülle über alle
 * bespielbaren Halte) reicht von 4,50 bis 5,50 Ost und von 52,06 bis 52,66 Nord —
 * Zandvoort im Westen, Lelystad im Osten, Utrecht im Süden, Hoorn im Norden.
 *
 * Alle Werte S, W, N, O.
 */

/**
 * Spielgebiet plus rund 20 km. Für alles, wonach „am nächsten" gefragt wird: ein
 * Museum oder eine Gemeentegrenze knapp ausserhalb der Gebietsgrenze zählt für eine
 * Randstation sehr wohl, sonst bekommt sie ein falsches Ergebnis.
 *
 * Die Ostkante lag bis September 2026 bei 5,35 und schnitt damit Lelystad ab, das im
 * Spielgebiet liegt — für Halte im Osten war „dein nächstes Museum" schlicht falsch.
 */
export const BBOX = [52.0, 4.25, 52.76, 5.79]

/**
 * Spielgebiet plus rund 5 km. Für Ebenen, nach denen nur „dieselbe wie meine?"
 * gefragt wird — welche Wijk 20 km ausserhalb liegt, entscheidet keine Antwort.
 * Auf Buurt-Ebene spart das ein Drittel der Datei.
 */
export const INNER_BBOX = [52.01, 4.43, 52.71, 5.57]
