let map, pano, svs;
let labels_overlay_layer;
let override_selection_map, override_undermap;
let local_ID;
// let upload_targets;
let locs, locs_extras;
let active_loc_key, active_marker;
let next_key;
let locs_added = new Map(), locs_modified = new Map(), deleted_count = 0;
let badcam_block_override = null;

/*
 * Workaround for Google "falling back" to slower rendering mode for API Street View on Linux + Firefox combination
 * https://reanna.neocities.org/blog/street-view-linux-firefox/
 */

let ua = navigator.userAgent;
if (ua.includes("Linux") && ua.includes("Firefox")) {
    ua = ua.replace("Linux", "GNU/L");
    Object.defineProperty(
        navigator,
        'userAgent',
        {
            get: () => { return ua; },
            configurable: true
        }
    )
}

/*
 * Maps API bootstrap loader
 * https://developers.google.com/maps/documentation/javascript/load-maps-js-api
 */
browser.storage.local.get("Ak").then(
    (items) => {
        if(items.Ak) {
            (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
                key: items.Ak,
                // v: "weekly",
                // Use the 'v' parameter to indicate the version to use (weekly, beta, alpha, etc.).
                // Add other bootstrap parameters as needed, using camel case.
                region: "MX",
            });
        }
        else {
            alert("API key not found.");
        }
    }
);

async function editor_setup() {

    await google.maps.importLibrary("core");
    await google.maps.importLibrary("maps");
    await google.maps.importLibrary("streetView");

    let editor = document.getElementById("editor");

    map = new google.maps.Map(
        document.getElementById("map"),
        {
            center: { lat: 0, lng: 0 },
            zoom: 1,
            tilt: 0,
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

    /*
        Calling overlayMapTypes.push directly failed to put the
        labels layer above the Street View coverage layer, even
        when the call is placed at the end, long after the 
        StreetViewCoverageLayer.setMap call.
        
        So we set up a proxy on overlayMapTypes to wait for the 
        Street View coverage layer to be pushed first.
    */
    map.overlayMapTypes = new Proxy(
        map.overlayMapTypes,
        {
            set(target, prop, value, receiver) {
                if(prop == "length" && value == 1) {
                    target.length = 1;
                    
                    labels_overlay_layer = new google.maps.StyledMapType(
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
                    );
                    target.push(labels_overlay_layer);

                    map.overlayMapTypes = target;
                }
                else {
                    Reflect.set(target, prop, value);
                }
            }
        }
    );

    /*
        TransitLayer isn't actually a separate layer -- it's drawn
        into the base map tiles. The featureType "transit" in
        StyledMapType unfortunately only covers features present
        on the vanilla map, mostly physical, above-ground rail lines,
        in that thin gray style except in certain parts of Asia;
        ferry and aerial lift routes presumably; and station/stop
        labels. So I don't think we can draw transit lines above
        StreetViewCoverageLayer.
    */
    (new google.maps.TransitLayer()).setMap(map);

    (new google.maps.StreetViewCoverageLayer()).setMap(map);


    const view_options_control = document.getElementById("map-options-control-stash").content.firstElementChild;
    
    view_options_control.querySelector("#labels-in-top-layer").addEventListener(
        "input",
        (ev) => {
            if(ev.target.checked) {
                map.setOptions(
                    {
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
                map.overlayMapTypes.push(labels_overlay_layer);
            }
            else {
                map.setOptions(
                    { styles: [] }
                );
                map.overlayMapTypes.pop();
            }
        }
    );

    view_options_control.querySelector(".map-control-mimic").addEventListener(
        "mouseenter",
        () => {
            document.getElementById("map-options-popup").style.display = "block";
        }
    )
    view_options_control.addEventListener(
        "mouseleave",
        () => {
            document.getElementById("map-options-popup").style.display = "none";
        }
    )

    map.controls[google.maps.ControlPosition.TOP_LEFT].push(
        view_options_control
    );

    map.addListener(
        "click",
        create_loc_from_map
    );


    const pano_div = document.getElementById("pano");

    pano = new google.maps.StreetViewPanorama(pano_div);

    svs = new google.maps.StreetViewService();

    const pano_guide_toggle = document.getElementById("pano-guide-toggle-control-stash").content.firstElementChild;
    pano_guide_toggle.querySelector("button").addEventListener(
        "click",
        (event) => {
            event.target.disabled = true;
            const guides = pano_div.querySelector("#guides");
            if(guides.moved == null) {
                guides.moved = true;
                pano_div.querySelector('div[aria-label="Map"]').after(
                    guides
                );
            }
            guides.hidden = !(guides.hidden);
            event.target.disabled = false;
        }
    );
    pano.controls[google.maps.ControlPosition.BOTTOM_LEFT].push(
        pano_guide_toggle
    );

    pano_div.append(document.getElementById("pano-blocked-submodal-stash").content.firstElementChild);

    // If pano ID changes 
    pano.addListener(
        "pano_changed",
        () => {
            const menu = document.getElementById("time-machine-temp");
            menu.disabled = true;
            menu.innerHTML = "";
            const panoID = pano.getPano();
            svs.getPanoramaById(panoID).then(
                (d) => {
                    const data = d.data;

                    ////////////////////////////////////////////
                    // Update list of available panorama months
                    ////////////////////////////////////////////

                    const list = data.time;
                    
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

                    //////////////////////////
                    // Update pano dimensions
                    //////////////////////////

                    const pano_size = d.data.tiles.worldSize;
                    document.getElementById("pano-size").value = `${pano_size.width} × ${pano_size.height}`;
                }
            );

            // also update pano ID field
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
    );

    document.getElementById("time-machine-temp").addEventListener(
        "change",
        (e) => {
            pano.setPano(e.target.value);
            document.getElementById("lock-panoid").checked = true;
        }
    );

    document.getElementById("select-override").addEventListener(
        "click",
        open_override_popup_listener
    );
    
    document.getElementById("override-popup-swap").addEventListener(
        "click",
        swap_override_popup_layers_listener
    )
    
    document.getElementById("override-popup-init-underlay").addEventListener(
        "click",
        enable_underlay_listener
    );
    
    document.getElementById("override-popup-fg-slider").addEventListener(
        "input",
        override_layer_mix_listener
    );
    
    document.getElementById("save-loc").addEventListener(
        "click",
        save_loc_listener
    );
    
    document.getElementById("del-loc").addEventListener(
        "click",
        delete_loc_listener
    );

    document.getElementById("open-import-modal").addEventListener(
        "click",
        () => {
            document.getElementById("import-modal").showModal();
        }
    );

    document.getElementById("open-targets-modal").addEventListener(
        "click",
        () => {
            document.getElementById("targets-modal").showModal();
        }
    );

    for(const child of editor.children) {
        if(child.tagName == "DIALOG") {

            // don't trigger loc_paste_listener if modals are open
            child.addEventListener(
                "paste",
                ev => ev.stopPropagation()
            );

            child.querySelector("button.modal-cancel").addEventListener(
                "click",
                close_ancestor_dialog
            );
        }
    }

    document.getElementById("import-source-gg").addEventListener(
        "paste",
        (event) => {
            const match = event.clipboardData.getData("text").match(
                /https:\/\/www\.geoguessr\.com\/(?:maps|map-maker)\/([0-9a-f]{24})/
            );
            if(match) {
                event.preventDefault();
                event.target.value = match[1];
            }
        }
    );

    document.getElementById("gg-import-execute").addEventListener(
        "click",
        (event) => {
            import_locs_from_gg(
                event,
                document.getElementById("import-source-gg").value,
                document.getElementById("source-as-target").checked
            )
        }
    );

    document.getElementById("back-up-to-file").addEventListener(
        "click",
        back_up_map_to_file_listener
    );
    
    document.getElementById("save-map").addEventListener(
        "click",
        local_map_save_listener
    );

    document.getElementById("save-upload-map").addEventListener(
        "click",
        save_upload_map_listener
    );

    editor.addEventListener(
        "paste",
        loc_paste_listener
    )

    editor.setup_finished = true;
}

async function open_map(storage_key) {

    if(document.getElementById("editor").setup_finished != true) {
        await editor_setup();
    }

    local_ID = storage_key;

    browser.storage.local.get(local_ID).then(
        (items) => {
            const data = items[local_ID];

            locs = new Map(
                data.locs.map(
                    (loc, index) => {
                        create_marker(index, loc);
                        return [index, loc];
                    }
                )
            );

            locs_extras = new Map(
                data.locs_extras.map(
                    (element, index) => [index, element]
                )
            );

            for(const target of data.upload_targets) {
                add_target(target);
            }

            next_key = locs.size;
            document.getElementById("count").textContent = `${next_key}`;

            document.getElementById("editor").hidden = false;
        }
    );
}



function create_loc_from_panoid(id) {
    if(badcam_block_override != null) dismiss_pano_blocked_modal();

    if(id.length != 22 && id.length != 64) {
        /*
         * ID not directly usable; construct protobuf message and encode.
         * Byte 0: specifies field representing type of pano
         * Byte 1: code for type of pano, in this case a user-uploaded photosphere
         * Byte 2: specifies field for ID string
         * Byte 3: ID string length
         */
        id = btoa("\u0008\u000a\u0012" + String.fromCharCode(id.length) + id);
    }
    svs.getPanoramaById(id).then(
        (resp) => {
            create_loc_from_svs_response(resp, true);
        }
    );
}

function create_loc_from_map(ev) {
    if(badcam_block_override != null) dismiss_pano_blocked_modal();

    svs.getPanorama(
        {
            location: ev.latLng,
            preference: google.maps.StreetViewPreference.NEAREST
        }
    ).then(
        (response) => {
            const ws = response.data.tiles.worldSize;
            // if(pano_size_blacklist.has(ws.width)) {
            if(pano_size_blacklist.has(`${ws.width} x ${ws.height}`)) {
                badcam_block(response);
            }
            else {
                create_loc_from_svs_response(response);
            }
        }
    );
}

function badcam_block(response) {
    close_loc();
    const data = response.data;
    const pano_blocked_submodal = document.getElementById("pano-blocked-submodal");
    pano_blocked_submodal.querySelector("#pano-blocked-shame-line").textContent = `pano ID: ${data.location.pano}, uploader: ${data.copyright.slice(2)}, date: ${data.imageDate}`;
    pano_blocked_submodal.hidden = false;

    badcam_block_override = () => {
        dismiss_pano_blocked_modal();
        create_loc_from_svs_response(response);
    };
    
    pano_blocked_submodal.querySelector("button").addEventListener(
        "click",
        badcam_block_override
    );
}

function dismiss_pano_blocked_modal() {
    const pano_blocked_submodal = document.getElementById("pano-blocked-submodal");
    pano_blocked_submodal.hidden = true;
    pano_blocked_submodal.querySelector("button").removeEventListener(
        "click",
        badcam_block_override
    );
    badcam_block_override = null;
}

function create_loc_from_svs_response(d, from_id = false) {
    if(d != null) {
        const retrieved_loc = d.data.location;
        const latLng = retrieved_loc.latLng;

        const constructed_loc = {
            lat: latLng.lat(),
            lng: latLng.lng(),
            panoId: null,
            heading: 0,
            pitch: 0,
            zoom: 0
        };

        const extras = {
            lat: latLng.lat(),
            lng: latLng.lng(),
            pos_override: false,
            pano_on_last_save: retrieved_loc.pano
        }

        /*
         * Set panoId if (1) created by paste, or (2) is user-uploaded.

         * Locking down the panoId in case (2) is desirable because calling
         * svs.getPanoramaByLocation at a blue circle sometimes returns a 
         * pano at a different latLng, and calling setPosition at that latLng
         * sometimes opens a second, different pano. This made the initial pano
         * undiscoverable. To make the matter worse, the behavior occasionally
         * allowed bad panos to bypass the blacklist check because only the
         * initial pano was checked.
         * 
         * I'm limiting (2) to user-uploaded panos for now because Google panos
         * are unstable, and because I haven't noticed any badcam switcheroo
         * originating from a Google pano yet.
         */
        if(retrieved_loc.pano.length > 22 || from_id) {
            constructed_loc.panoId = retrieved_loc.pano;
        }

        const key = next_key++;
        locs.set(key, constructed_loc);
        locs_extras.set(key, extras);
        locs_added.set(key, null);
        document.getElementById("count").textContent = `${locs.size}`;
        update_count_of_changes();
        open_location(create_marker(key, constructed_loc));
    }
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
    if(badcam_block_override != null) dismiss_pano_blocked_modal();

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
    document.getElementById("pos-override").checked = locs_extras.get(active_loc_key).pos_override;
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

function update_count_of_changes() {
    let h = "";
    if(locs_added.size > 0) {
        h = `<span class="count-added">+${locs_added.size}</span> `;
    }
    if(deleted_count > 0) {
        h += `<span class="count-deleted">−${deleted_count}</span> `;
    }
    if(locs_modified.size > 0) {
        h += `<span class="count-modified">⟳${locs_modified.size}</span>`;
    }
    if(h == "") {
        h = "no changes";
    }
    document.getElementById("changes").innerHTML = h;
}

function loc_paste_listener(e) {
    if(e.target.tagName != 'INPUT' && e.target.tagName != 'TEXTAREA') {
        const s = e.clipboardData.getData('text');
        if(URL.canParse(s)) {
            let u = new URL(s);
            // google.*
            if(/\bgoogle(?:\.\w{2,3}){1,2}$/.test(u.hostname) && u.pathname.startsWith("/maps/")) {
                // look between !1s and the next !
                // 22 (official), or 44 or 43 (unofficial) chars
                create_loc_from_panoid(/(?<=!1s)[\w-]{22}(?:[\w-]{21}[\w-]?)??(?=!)/.exec(u.pathname)[0]);
            }
        }
        else {
            if(
                (s.length == 22 || s.length == 64 && s.startsWith("CAoS") && s.slice(6,13) == "FGMVFpc")
                && !(/[^\w-=]/.test(s))
            ) {
                create_loc_from_panoid(s);
            }
        }
    }
}

function open_override_popup_listener(e) {
    const modal = document.getElementById("pos-override-modal");

    if(override_selection_map == null) {
        override_selection_map = new google.maps.Map(
            document.getElementById("override-popup-map"),
            {
                center: map.center,
                zoom: map.zoom,
                tilt: 0,
                draggableCursor: "crosshair",
                streetViewControl: false,
                clickableIcons: false
            }
        );
        override_selection_map.addListener(
            "click",
            (e) => {
                modal.close();
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

    modal.querySelector("#override-popup-init-underlay").disabled = false;
    modal.querySelector("#override-popup-swap").disabled = true;
    Object.assign(
        modal.querySelector("#override-popup-fg-slider"),
        {
            value: "1",
            disabled: true
        }
    );
    modal.style.setProperty("--override-popup-fg-opacity", "1");
    const undermap = modal.querySelector("#override-popup-undermap");
    undermap.hidden = true;
    undermap.className = "override-map-layer";
    modal.querySelector("#override-popup-map").className = "override-map-layer override-popup-foreground";

    modal.showModal();
}

function enable_underlay_listener(e) {
    e.target.disabled = true;

    const modal = document.getElementById("pos-override-modal");
    const undermap_div = modal.querySelector("#override-popup-undermap");

    if(override_undermap == null) {
        override_undermap = new google.maps.Map(
            undermap_div,
            {
                center: override_selection_map.center,
                zoom: override_selection_map.zoom,
                tilt: 0,
                streetViewControl: false,
                clickableIcons: false
            }
        )
    }
    else {
        override_undermap.setCenter(override_selection_map.center);
        override_undermap.setZoom(override_selection_map.zoom);
    }

    undermap_div.hidden = false;
    modal.querySelector("#override-popup-swap").disabled = false;
    modal.querySelector("#override-popup-fg-slider").disabled = false;
}

function swap_override_popup_layers_listener(e) {
    e.target.disabled = true;

    const modal = document.getElementById("pos-override-modal");
    const layer1 = modal.querySelector("#override-popup-map");
    const layer2 = modal.querySelector("#override-popup-undermap");
    [layer1.className, layer2.className] = [layer2.className, layer1.className];

    e.target.disabled = false;
}

function override_layer_mix_listener(e) {
    document.getElementById("pos-override-modal").style.setProperty(
        "--override-popup-fg-opacity",
        e.target.valueAsNumber
    )
}

function save_loc_listener(e) {
    e.target.disabled = true;
    const loc = locs.get(active_loc_key);
    const extras = locs_extras.get(active_loc_key);

    if(document.getElementById("lock-panoid").checked) {
        loc.panoId = pano.getPano();
    }
    else {
        loc.panoId = null;
    }
    extras.pano_on_last_save = pano.getPano();

    if(extras.pos_override = document.getElementById("pos-override").checked) {
        loc.lat = extras.lat = document.getElementById("set-lat").valueAsNumber;
        loc.lng = extras.lng = document.getElementById("set-lng").valueAsNumber;
    }
    else {
        const pos = pano.getPosition();
        loc.lat = extras.lat = pos.lat();
        loc.lng = extras.lng = pos.lng();
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

    if( !locs_added.has(active_loc_key) && 
        !locs_modified.has(active_loc_key) ) {
        locs_modified.set(active_loc_key, null);
        update_count_of_changes();
    }

    e.target.disabled = false;
}

function close_loc() {
    active_marker = null;
    const time_machine_menu = document.getElementById("time-machine-temp");
    time_machine_menu.disabled = true;

    pano.setVisible(false);

    time_machine_menu.innerHTML = "";
    document.getElementById("panoid").value = "";
    document.getElementById("lock-panoid").checked = false;
    document.getElementById("pos-override").checked = false;
    document.getElementById("set-lat").value = NaN;
    document.getElementById("set-lng").value = NaN;
}

function delete_loc_listener(e) {
    e.target.disabled = true;
    document.getElementById("save-loc").disabled = true;
    document.getElementById("select-override").disabled = true;
    active_marker.setMap(null);
    close_loc();
    
    locs.delete(active_loc_key);
    locs_extras.delete(active_loc_key);
    document.getElementById("count").textContent = `${locs.size}`;
    if(locs_added.has(active_loc_key)) {
        locs_added.delete(active_loc_key);
    }
    else {
        if(locs_modified.has(active_loc_key)) {
            locs_modified.delete(active_loc_key);
        }
        deleted_count++;
    }
    update_count_of_changes();
}

function close_ancestor_dialog(ev) {
    let target = ev.target.parentElement;
    while(target.tagName != "DIALOG")
        target = target.parentElement;
    target.close();
}

function import_locs_from_gg(event, map_ID, add_as_target) {
    event.target.disabled = true;

    fetch(
        `https://www.geoguessr.com/api/v3/profiles/maps/${map_ID}`,
        {
            method: 'GET',
            credentials: 'include'
        }
    ).then(
        response => response.json()
    ).then(
        (data) => {

            for(const loc of data.customCoordinates) {

                locs.set(next_key, loc);

                locs_extras.set(
                    next_key,
                    {
                        lat: loc.lat,
                        lng: loc.lng,
                        /*
                            Defer checking for latLng override
                            since making getPanorama requests
                            for every location with pano ID could
                            take a while.
                        */
                        // ...(
                        //     loc.panoId ? {initialization_unfinished: true} : {}
                        // )
                        // initialization_unfinished: true
                    }
                );
                
                locs_added.set(next_key, null);

                create_marker(next_key, loc);

                next_key++;
            }

            // locs = new Map(
            //     ...locs,
            //     data.customCoordinates.map(
            //         (loc, index) => [next_key + index, loc]
            //     )
            // );

            // locs_extras = new Map(
            //     ...locs_extras,
            //     data.customCoordinates.map(
            //         (loc, index) => [
            //             next_key + index,
            //             {
            //                 lat: loc.lat,
            //                 lng: loc.lng,
            //                 /*
            //                     Defer checking for latLng override
            //                     since making getPanorama requests
            //                     for every location with pano ID could
            //                     take a while.
            //                 */
            //                 ...(
            //                     loc.panoId ? {unfinished_initialization: true} : {}
            //                 )
            //             }
            //         ]
            //     )
            // );

            // locs_added = new Map(
            //     ...locs_added,
            //     ...
            // )

            // next_key += data.customCoordinates.length;

            document.getElementById("count").textContent = `${locs.size}`;
            update_count_of_changes();

            if(add_as_target) {
                add_target(data);
            }
        },

        (failure_reason) => alert(failure_reason)
        
    ).finally(
        () => {
            close_ancestor_dialog(event);
            event.target.disabled = false;
        }
    );
}


function add_target(data) {
    const node = document.getElementById("target-template").content.cloneNode(true);

    node.querySelector(".target-map-id").value = data.id;
    node.querySelector(".target-name").value = data.name;
    node.querySelector(".target-description").value = data.description;
    node.querySelector(".target-regions").value = JSON.stringify(data.regions);
    node.querySelector(".target-avatar").value = JSON.stringify(data.avatar);
    node.querySelector(".target-published").checked = data.published;
    node.querySelector(".target-highlighted").checked = data.highlighted;

    document.getElementById("targets-modal").append(node);
}

function map_data_JSON_compatible() {
    const target_nodes = document.getElementById("targets-modal").querySelectorAll(".target-div");
    const upload_targets = Array.from(target_nodes.values()).map(
        (node) => ({
            id:          node.querySelector(".target-map-id").value,
            name:        node.querySelector(".target-name").value,
            // customCoordinates: null,
            regions:     JSON.parse(node.querySelector(".target-regions").value),
            description: node.querySelector(".target-description").value,
            avatar:      JSON.parse(node.querySelector(".target-avatar").value),
            published:   node.querySelector(".target-published").checked,
            highlighted: node.querySelector(".target-highlighted").checked,
        })
    );

    return {
        locs: Array.from(locs.values()),
        locs_extras: Array.from(locs_extras.values()),
        upload_targets
    }
}

function back_up_map_to_file_listener(event) {
    browser.storage.local.get("index").then(
        (items) => {
            pass_object_to_filesystem_as(
                map_data_JSON_compatible(),
                `${
                    items.index.find(
                        (map_element) => map_element.id == local_ID
                    ).name
                } backup ${
                    (new Date()).toLocaleString("sv").replaceAll(':', '.')
                }.json`
            );
        }
    )
}

async function save_map(should_upload) {

    const map_data = map_data_JSON_compatible();

    const save_status_box = document.getElementById("save-status");
    save_status_box.replaceChildren();

    browser.storage.local.set({ [local_ID]: map_data }).then(
        () => {
            const status_ok_span_template = document.getElementById("status-ok-span-template").content;
            save_status_box.append(
                (new Date()).toLocaleTimeString('sv'),
                status_ok_span_template.cloneNode(true),
                "Local save was successful."
            );

            locs_added = new Map();
            locs_modified = new Map();
            deleted_count = 0;
            
            update_count_of_changes();

            if(should_upload) {
                const upload_targets = map_data.upload_targets;
                const num_targets = upload_targets.length;

                for(let i = 0; i < num_targets; ) {
                    const target = upload_targets[i++];

                    const body_object = (
                        ({name, regions, description, avatar, published, highlighted}) => ({
                            name,
                            customCoordinates: map_data.locs,
                            regions,
                            description,
                            avatar,
                            published,
                            highlighted,
                        })
                    )(target);

                    fetch(
                        `https://www.geoguessr.com/api/v3/profiles/maps/${target.id}`,
                        {
                            method: 'POST',
                            body: JSON.stringify(body_object),
                            credentials: 'include',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        }
                    ).then(
                        (response) => {
                            if(response.status == 200) {
                                response.json().then(
                                    (data) => {
                                        save_status_box.append(
                                            document.createElement('br'),
                                            (new Date()).toLocaleTimeString('sv'),
                                            status_ok_span_template.cloneNode(true),
                                            `(${i} / ${num_targets}) "${data.name}" uploaded with ${data.customCoordinates.length} locations.`
                                        );
                                        save_status_box.scrollTop = save_status_box.scrollHeight;
                                    }
                                );
                            }
                            else {
                                throw new Error(`Server responded with code ${response.status}.`);
                            }
                        }
                    ).catch(
                        (failture_reason) => {
                            save_status_box.append(
                                document.createElement('br'),
                                (new Date()).toLocaleTimeString('sv'),
                                document.getElementById("status-fail-span-template").content.cloneNode(true),
                                `(${i} / ${num_targets}) "${target.name}" upload failed: ${failture_reason}`
                            );
                            console.log(failture_reason);
                        }
                    );
                }
            }
        }
    );
}


function local_map_save_listener(e) {
    e.target.disabled = true;

    save_map(false).then(
        () => {
            e.target.disabled = false;
        }
    );
}

function save_upload_map_listener(event) {
    event.target.disabled = true;

    save_map(true).then(
        () => {
            event.target.disabled = false;
        }
    )
}