let map, pano, svs;
let override_selection_map, override_undermap;
let mapID;
let locs;
let active_loc_key, active_marker;
let next_key;

window.onload = () => {
    browser.storage.local.get("Ak").then(
        (ob) => {
            if(ob.Ak != null) {
                const gm_loader = document.createElement('script');
                gm_loader.src = `https://maps.googleapis.com/maps/api/js?key=${ob.Ak}`;
                document.head.appendChild(gm_loader);

                document.getElementById("open-map-button").addEventListener(
                    "click",
                    (e) => {
                        e.target.disabled = true;
                        mapID = document.getElementById("mapID").value;
                        open_map();
                    }
                );
            }
            else {
                console.log("welp");
            }
        }
    )
}



function open_map() {
    pano = new google.maps.StreetViewPanorama(
        document.getElementById("pano")
    );

    svs = new google.maps.StreetViewService();

    // If pano ID changes, update corresponding field and update list of panoramas taken at this location over time
    pano.addListener(
        "pano_changed",
        () => {
            const menu = document.getElementById("time-machine-temp");
            menu.disabled = true;
            menu.innerHTML = "";
            const panoID = pano.getPano();
            svs.getPanoramaById(panoID).then(
                (d) => {
                    const list = d.data.time;
                    
                    // Add matching option first to select it by default
                    let match = list.length - 1;
                    while(match >= 0) {
                        if(list[match].pano == panoID) {
                            break;
                        }
                        match--;
                    }
                    if(match == -1) {
                        return;
                    }
                    const active = time_machine_option(list[match]);
                    menu.append(active);

                    // then add the rest
                    if(list.length > 1) {
                        for(let i = list.length - 1; i > match; i--) {
                            menu.insertBefore(time_machine_option(list[i]), active);
                        }
                        for(let i = match - 1; i >= 0; i--) {
                            menu.append(time_machine_option(list[i]));
                        }
    
                        menu.disabled = false;
                    }
                }
            );
            document.getElementById("panoid").value = panoID;
        }
    );

    pano.addListener(
        "position_changed",
        () => {
            const pos = pano.getPosition();
            document.getElementById("sv-lat").value = pos.lat();
            document.getElementById("sv-lng").value = pos.lng();
        }
    )

    document.getElementById("time-machine-temp").addEventListener(
        "change",
        (e) => {
            pano.setPano(e.target.value);
            document.getElementById("lock-panoid").checked = true;
        }
    )

    fetch(
        `https://www.geoguessr.com/api/v3/profiles/maps/${mapID}`,
        {
            method: 'GET',
            credentials: 'include'
        }
    ).then(
        response => response.json()
    ).then(
        (data) => {
            locs = new Map(
                data.customCoordinates.map(
                    (element, index) => {
                        return [index, element];
                    }
                )
            );
            next_key = data.customCoordinates.length;
            document.getElementById("count").textContent = `${next_key}`;

            map = new google.maps.Map(
                document.getElementById("map"),
                {
                    center: { lat: 0, lng: 0 },
                    zoom: 1,
                    draggableCursor: "crosshair",
                    streetViewControl: false,
                    clickableIcons: false,
                    styles: [
                        {
                            elementType: "labels",
                            stylers: [
                                { visibility: "off" }
                            ]
                        }
                    ]
                }
            );
            
            // Calling overlayMapTypes.push directly in this promise 
            // failed to put the labels layer above the Street View 
            // coverage layer, even when the call is placed at the end, 
            // long after the StreetViewCoverageLayer.setMap call.
            //
            // So we set up a proxy on overlayMapTypes to wait for the 
            // Street View coverage layer to be pushed first.
            map.overlayMapTypes = new Proxy(
                map.overlayMapTypes,
                {
                    set(target, prop, value, receiver) {
                        if(prop == "length" && value == 1) {
                            target.length = 1;
                            target.push(
                                new google.maps.StyledMapType(
                                    [
                                        {
                                            stylers: [
                                                { visibility: "off" }
                                            ]
                                        },
                                        {
                                            elementType: "labels",
                                            stylers: [
                                                { visibility: "on" }
                                            ]
                                        }
                                    ],
                                    {
                                        name: "Labels"
                                    }
                                )
                            );
                        }
                        else {
                            Reflect.set(target, prop, value);
                        }
                    }
                }
            );

            document.getElementById("name").value = data.name;
            document.getElementById("description").textContent = data.description;
            document.getElementById("regions").textContent = JSON.stringify(data.regions);
            document.getElementById("avatar").textContent = JSON.stringify(data.avatar);
            document.getElementById("published").checked = data.published;
            document.getElementById("highlighted").checked = data.highlighted;

            (new google.maps.StreetViewCoverageLayer()).setMap(map);

            for(let [key, loc] of locs) {
                create_marker(key, loc);
            }

            map.addListener(
                "click",
                create_loc_if_exists
            );

            document.getElementById("select-override").addEventListener(
                "click",
                (e) => {
                    if(override_selection_map == null) {
                        override_selection_map = new google.maps.Map(
                            document.getElementById("override-popup-map"),
                            {
                                center: map.center,
                                zoom: map.zoom,
                                draggableCursor: "crosshair",
                                streetViewControl: false,
                                clickableIcons: false
                            }
                        );
                        override_selection_map.addListener(
                            "click",
                            (e) => {
                                hide_override_popup();
                                document.getElementById("set-lat").value = e.latLng.lat();
                                document.getElementById("set-lng").value = e.latLng.lng();
                                document.getElementById("pos-override").checked = true;
                                document.getElementById("lock-panoid").checked = true;
                            }
                        );
                    }
                    else {
                        override_selection_map.setCenter(map.center);
                        override_selection_map.setZoom(map.zoom);
                    }
                    const popup = document.getElementById("pos-override-popup");
                    popup.querySelector("#override-popup-init-underlay").disabled = false;
                    popup.querySelector("#override-popup-swap").disabled = true;
                    const slider = popup.querySelector("#override-popup-fg-slider");
                    slider.value = "1";
                    slider.disabled = true;
                    popup.style.setProperty("--override-popup-fg-opacity", "1");
                    const undermap = popup.querySelector("#override-popup-undermap");
                    undermap.style.display = "none";
                    undermap.className = "override-popup-layer";
                    popup.querySelector("#override-popup-map").className = "override-popup-layer override-popup-foreground";

                    popup.style.display = "block";
                }
            );

            document.getElementById("override-popup-swap").addEventListener(
                "click",
                (e) => {
                    e.target.disabled = true;

                    const popup = document.getElementById("pos-override-popup");
                    const layer1 = popup.querySelector("#override-popup-map");
                    const layer2 = popup.querySelector("#override-popup-undermap");
                    [layer1.className, layer2.className] = [layer2.className, layer1.className];

                    e.target.disabled = false;
                }
            )

            document.getElementById("override-popup-init-underlay").addEventListener(
                "click",
                (e) => {
                    e.target.disabled = true;

                    const popup = document.getElementById("pos-override-popup");
                    const undermap_div = popup.querySelector("#override-popup-undermap");

                    if(override_undermap == null) {
                        override_undermap = new google.maps.Map(
                            undermap_div,
                            {
                                center: override_selection_map.center,
                                zoom: override_selection_map.zoom,
                                streetViewControl: false,
                                clickableIcons: false
                            }
                        )
                    }
                    else {
                        override_undermap.setCenter(override_selection_map.center);
                        override_undermap.setZoom(override_selection_map.zoom);
                    }

                    undermap_div.style.display = "block";
                    popup.querySelector("#override-popup-swap").disabled = false;
                    popup.querySelector("#override-popup-fg-slider").disabled = false;
                }
            );

            document.getElementById("override-popup-fg-slider").addEventListener(
                "input",
                (e) => {
                    document.getElementById("pos-override-popup").style.setProperty(
                        "--override-popup-fg-opacity",
                        e.target.valueAsNumber
                    )
                }
            );

            document.getElementById("override-popup-cancel").addEventListener(
                "click",
                hide_override_popup
            );

            document.getElementById("save-loc").addEventListener(
                "click",
                (e) => {
                    e.target.disabled = true;
                    const loc = locs.get(active_loc_key);

                    if(document.getElementById("lock-panoid").checked) {
                        loc.panoId = pano.getPano();
                    }
                    else {
                        loc.panoId = null;
                    }

                    if(document.getElementById("pos-override").checked) {
                        loc.lat = document.getElementById("set-lat").valueAsNumber;
                        loc.lng = document.getElementById("set-lng").valueAsNumber;
                    }
                    else {
                        const pos = pano.getPosition();
                        loc.lat = pos.lat();
                        loc.lng = pos.lng();
                    }

                    const pov = pano.getPov();
                    loc.heading = pov.heading;
                    loc.pitch = pov.pitch;
                    // zoom quirk: pano.zoom returns 0.16... when set to 0 for some reason
                    // (though all those values result in the same actual zoom level in the viewer)
                    loc.zoom = pov.zoom >= 0.17 ? pov.zoom : 0;

                    delete loc.countryCode;
                    delete loc.stateCode;

                    active_marker.setPosition(
                        {
                            lat: loc.lat,
                            lng: loc.lng
                        }
                    );

                    e.target.disabled = false;
                }
            );

            document.getElementById("del-loc").addEventListener(
                "click",
                (e) => {
                    e.target.disabled = true;
                    document.getElementById("save-loc").disabled = true;
                    document.getElementById("select-override").disabled = true;
                    
                    locs.delete(active_loc_key);
                    document.getElementById("count").textContent = `${locs.size}`;
                    active_marker.setMap(null);
                    active_marker = null;
                    
                    pano.setVisible(false);
                    
                    const time_machine_menu = document.getElementById("time-machine-temp");
                    time_machine_menu.disabled = true;
                    time_machine_menu.innerHTML = "";
                    document.getElementById("panoid").value = "";
                    document.getElementById("lock-panoid").checked = false;
                    document.getElementById("pos-override").checked = false;
                    document.getElementById("set-lat").value = NaN;
                    document.getElementById("set-lng").value = NaN;
                }
            );

            document.getElementById("save-map").addEventListener(
                "click",
                (e) => {
                    e.target.disabled = true;

                    const json = new Object();
                    json.name = document.getElementById("name").value;
                    json.customCoordinates = Array.from(locs.values());
                    json.regions = JSON.parse(document.getElementById("regions").textContent);
                    json.description = document.getElementById("description").textContent;
                    json.avatar = JSON.parse(document.getElementById("avatar").textContent);
                    json.published = document.getElementById("published").checked;
                    json.highlighted = document.getElementById("highlighted").checked;
                    
                    fetch(
                        `https://www.geoguessr.com/api/v3/profiles/maps/${mapID}`,
                        {
                            method: 'POST',
                            body: JSON.stringify(json),
                            credentials: 'include',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        }
                    ).then(
                        (response) => {
                            console.log(response);
                            const span = document.getElementById("save-status");
                            span.textContent = "";

                            if(response.status == 200) {
                                span.className = "success";
                                span.textContent = `Saved successfully at ${(new Date(response.headers.get("date"))).toLocaleString("sv")}`;
                            }
                            else {
                                span.className = "failure";
                                span.textContent = `status code ${response.status}`;
                            }

                            e.target.disabled = false;
                        },

                        (failure_reason) => {
                            const span = document.getElementById("save-status");
                            span.textContent = "";
                            span.className = "failure";
                            span.textContent = `Failed (${failure_reason})`;

                            e.target.disabled = false;
                        }
                    );

                    
                }
            );

            document.getElementById("save-map").disabled = false;
        }
    );
}

function create_loc_if_exists(e) {
    svs.getPanorama(
        {
            location: e.latLng,
            preference: google.maps.StreetViewPreference.NEAREST
        }
    ).then(
        (d, status) => {
            if(d != null) {
                const retrieved_loc = d.data.location;
                const latLng = retrieved_loc.latLng;

                const constructed_loc = new Object();
                constructed_loc.heading = 0;
                constructed_loc.lat = latLng.lat();
                constructed_loc.lng = latLng.lng();
                constructed_loc.panoId = null;
                constructed_loc.pitch = 0;
                constructed_loc.zoom = 0;

                const key = next_key++;
                locs.set(key, constructed_loc);
                document.getElementById("count").textContent = `${locs.size}`;
                open_location(create_marker(key, constructed_loc));
            }
        }
    )
}

function create_marker(key, loc) {
    const marker = new google.maps.Marker(
        {
            position: { lat: loc.lat, lng: loc.lng },
            map
        }
    );
    marker.key = key;
    marker.addListener(
        'click',
        (e) => {
            open_location(marker);
        }
    );
    return marker;
}

function open_location(marker) {
    active_marker = marker;
    active_loc_key = marker.key;
    let loc = locs.get(active_loc_key);
    
    document.getElementById("set-lat").value = loc.lat;
    document.getElementById("set-lng").value = loc.lng;
    
    if(loc.panoId != null) {
        document.getElementById("lock-panoid").checked = true;
        pano.setPano(loc.panoId);
    }
    else {
        document.getElementById("lock-panoid").checked = false;
        pano.setPosition(
            {
                lat: loc.lat,
                lng: loc.lng
            }
        );
    }
    pano.setPov(
        {
            heading: loc.heading,
            pitch: loc.pitch,
            zoom: loc.zoom
        }
    );
    document.getElementById("pos-override").checked = false;
    pano.setVisible(true);

    document.getElementById("save-loc").disabled = false;
    document.getElementById("del-loc").disabled = false;
    document.getElementById("select-override").disabled = false;
}

function time_machine_option(entry) {
    const opt = document.createElement("option");

    opt.value = entry.pano;

    // The property name for the timestamp of a StreetViewPanoramaData.time entry is obfuscated and changes from time to time.
    for(let [key, value] of Object.entries(entry)) {
        if(value instanceof Date) {
            // ISO 8601 YYYY-MM
            opt.textContent = value.toLocaleString('sv').slice(0,7);
            return opt;
        }
    }
}

function hide_override_popup() {
    document.getElementById("pos-override-popup").style.display = "none";
}