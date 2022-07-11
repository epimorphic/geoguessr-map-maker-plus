# Map Maker+

A map editor for GeoGuessr with additional features over the one provided by the game, packaged as a browser extension page launched from the toolbar.

The extension is built upon the WebExtensions APIs for Firefox. It may still work on other browsers.

You'll need to provide your own API key for the Google Maps JavaScript API. To set it, go to the extension's options.

## Features
- Edit your collection of locations as usual and load/save directly from/to GeoGuessr.
- Travel through time and select the best panorama taken at the location, just like on Google Maps.
- Prevent location mutation by locking down the pano ID.
- Correct the position of panoramas that don't match the map, by selecting the true (or at least a more accurate) location on the map.
    - In certain cases _\*cough\*_ where you want to correct the location using the satellite map but it's offset from the standard vector map, you can even independently move and overlay the two.

## To do
- [ ] Show save request resolution and timestamp on page
- [ ] Draw marker for current location on position override map
- [ ] Draw labels on top of the Street View coverage layer
- [ ] Draw transit layer
- [ ] Other cosmetic improvements

- [ ] Make storage.local the primary data store instead of GeoGuessr's server(s), to allow flexibility in what can be stored across edit sessions (such as saving the position override preference).
    - [ ] Implement location tagging
        - [ ] Implement import of locations and have tags applied to entire batch
        - [ ] Tag-based filter to upload only a subset of locations to GeoGuessr
    - [ ] Implement automatic location/update discovery/check (to reveal unmarked panoramas, reduce number of panoramas to check, and help with maintaining and upgrading locations)
        - For update checking, attach polygons to tags
        - Filter by resolution, uploader blacklist

- timeline with preview thumbnail, like on Google Maps?