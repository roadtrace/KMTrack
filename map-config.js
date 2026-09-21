/* SPOT IT — MapTiler browser configuration.
 *
 * The API key is a PUBLIC browser key: it is necessarily visible in the tile
 * requests the browser makes, exactly like the CARTO key it sits beside. It is
 * restricted to roadtrace.github.io, so it is useless from any other origin.
 * Keep it here and nowhere else.
 *
 * This style is used by the DARK basemap only. Light mode keeps the existing
 * CARTO Voyager raster, so switching themes never changes the light view.
 *
 * The MapTiler SDK, its stylesheet and the Leaflet plugin are vendored under
 * vendor/maptiler/ rather than loaded from a CDN, so there is no third-party
 * dependency at runtime. They are fetched on demand — the SDK is ~1.4 MB and
 * only dark mode needs it — and the service worker caches them on first use.
 */
(function(root){
  'use strict';

  const config = {
    /* Dark-mode vector basemap. `style` must be a full style URL — a bare map id
     * is rejected by the SDK (`[Map.setStyle]: Invalid style`), which then falls
     * back to its own default style. The API key is supplied separately as
     * `apiKey`, so the endpoint is stored WITHOUT it; the full request is:
     *   https://api.maptiler.com/maps/<mapId>/style.json?key=<apiKey>       */
    mapId: '01a0b86c-b154-7221-96a7-fc8197fe0662',
    apiKey: 'lkkR5aAqoFyDhXsqqFQE',
    styleUrl: 'https://api.maptiler.com/maps/01a0b86c-b154-7221-96a7-fc8197fe0662/style.json',

    /* Vendored assets, loaded in this order: stylesheet, SDK, Leaflet plugin. */
    sdkCssPath: 'vendor/maptiler/maptiler-sdk.css',
    sdkPath: 'vendor/maptiler/maptiler-sdk.umd.min.js',
    leafletPluginPath: 'vendor/maptiler/leaflet-maptilersdk.js'
  };

  if(typeof module === 'object' && module.exports) module.exports = config;
  if(root) root.SPOTITMapConfig = config;

})(typeof globalThis !== 'undefined' ? globalThis : this);
