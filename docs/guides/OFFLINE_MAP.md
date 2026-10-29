# Saved inspection map

In the Map tab, open **Offline map** and choose **Save inspection map** while connected. The app stores its existing NLEX calibration and retained interchange geometry in a separate map cache, displays the saved size/date, and enables **Use saved map**. **Use online map** restores the normal background when connected. **Remove saved map** removes only that downloaded map cache.

The current package is approximately 2.3 MB. It includes 438 available interchange lines and NLEX calibration reference lines. Available inspection markers and existing landmark overlays remain part of the map interface. It is a schematic inspection layer: it has no street-map background, downloaded satellite imagery, or guarantee of complete road coverage. Calibration references and GIS proximity do not establish surveyed accuracy or engineering connectivity.

When disconnected, the app automatically attempts to display the saved layer. Save it and open the app online first, so the app shell and assets are cached too. Browser storage limits or eviction can remove offline resources; the app checks whether the saved package is complete before using it. Save again if it reports that the map is missing. This feature does not export, clear, or migrate inspection records or photographs.

Online startup now warms the locally bundled dark-map engine during idle time, caches its assets with the app shell, and reuses the existing basemap for same-theme updates. Actual speed depends on the device and network; online map tiles still follow their providers' normal caching behavior. No MapTiler or CARTO tiles are bulk-downloaded.

Validation uses synthetic data and an isolated browser. Save/load/remove, partial or corrupt storage, quota failure, preservation across app cache updates, and disconnected page reload were checked locally. Physical-phone field behavior remains to be checked.
