# Map Maker+

A map editor for GeoGuessr with additional features over the one provided by the game, packaged as a browser extension page launched from the toolbar.

The extension is built upon the WebExtensions APIs for Firefox. It may still work on other browsers.

You'll need to provide your own API key for the Google Maps JavaScript API. To set it, go to the extension's options.

## Features
- Edit your collection of locations as usual and load/save directly from/to GeoGuessr.
    - Additional support for adding a location by pasting the URL of a Google Maps page that has the desired pano open (full-length links only for now), or a pano ID. Useful for panos hidden by another that has the same exact LatLng, or whose blue circle just doesn't respond to clicks.
- Compare panoramas captured across time at a location and select your favorite.
- Prevent location mutation by locking down the pano ID.
- Correct the position of panoramas that don't match the map, by selecting the true (or at least a more accurate) location on the map.
    - In certain cases _\*cough\*_ where you want to correct the location using the satellite map but it's offset from the standard vector map, you can even independently move and overlay the two.
- Automatically blocks panos that are unlikely to come from anything other than a low-quality camera, based on their size signatures (can be overridden).

## To do
- [ ] Draw marker for current location on position override map

- [x] Make storage.local the primary data store instead of GeoGuessr's server(s), to allow flexibility in what can be stored across edit sessions (such as saving the position override preference).
    - [ ] Implement location tagging
        - [ ] Implement import of locations and have tags applied to entire batch
        - [ ] Tag-based filter to upload only a subset of locations to GeoGuessr
    - [ ] Implement automatic location/update discovery/check (to reveal unmarked panoramas, reduce number of panoramas to check, and help with maintaining and upgrading locations)
        - For update checking, attach polygons to tags
        - Filter by resolution, uploader blacklist

- timeline with preview thumbnail, like on Google Maps?