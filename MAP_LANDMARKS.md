# Map landmarks

The map combines the existing `bridges.json` interchange records and Pulilan/Tibag Underpass with `map-landmarks.json` additions for NLEX, Harbor Link, SCTEX, and Connector. The bridge dataset is not modified. The paired Pulilan NB/SB structures share one named map pin.

## Sources and positioning

Additional positions are derived from OpenStreetMap motorway-junction nodes, retrieved on 2026-09-10 through https://overpass.private.coffee/api/interpreter. The response reports a source snapshot of 2026-05-31T22:37:44Z. Each additional record retains links to its original OSM nodes and its positioning method. A single named interchange spanning multiple ramp nodes is represented by their centroid; these are overview landmarks, not survey points or lane-specific navigation destinations. Do not infer toll or operational status from a pin.

The displayed facility type is explicit: only records identified as interchanges use “Interchange”; ordinary access points use “Exit.” Each supplemental record stores a KM station derived from the matching SPOT IT calibration corridor. Existing bridge-based interchanges use the authoritative `from` station in `bridges.json`.

OpenStreetMap data is © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). The existing Leaflet map attribution links to OpenStreetMap. This small derived database retains its source and license metadata in `map-landmarks.json`.

Network/name coverage was cross-checked against the exit lists for [NLEX](https://en.wikipedia.org/wiki/North_Luzon_Expressway#Exits), [Harbor Link](https://en.wikipedia.org/wiki/NLEX_Harbor_Link#Exits), [SCTEX](https://en.wikipedia.org/wiki/Subic%E2%80%93Clark%E2%80%93Tarlac_Expressway#Exits), and [Connector](https://en.wikipedia.org/wiki/NLEX_Connector#Exits). Existing local assets take precedence. Future extensions are not inferred from road names.

## Maintenance

Update coordinates and source links together. Preserve the distinction between an existing structure's measured coordinates and a centroid derived from ramp nodes. Bundle updates with the service-worker version bump so landmark data remains available offline. Map landmarks are a separate display layer; they never enter inspection exports, bridge proximity calculations, or GPS calibration.

The Mindanao Avenue and Lingunan records use a separate direct OpenStreetMap API retrieval on 2026-09-10; their per-record links identify the connected road/ramp nodes. The bundled supplement contains 32 named locations in addition to 20 local interchange/underpass pins.
