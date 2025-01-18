window.onload = () => {
    document.getElementById("new-map").addEventListener(
        "click",
        new_map
    )

    refresh_map_list();

    document.getElementById("guides").style.setProperty(
        "--physical-pixel-size",
        `calc(1px / ${window.devicePixelRatio})`
    );
}

function refresh_map_list() {
    browser.storage.local.get("index").then(
        (items) => {
            let maps_array = items.index;
            if(maps_array == null) {
                maps_array = [];
            }
            document.getElementById("maps-list").replaceChildren(
                ...maps_array.map(create_map_li)
            );
        }
    )
}

function create_map_li(index_element) {
    const li = document.createElement("li");
    li.mapID = index_element.id;
    const b = document.createElement("button");
    b.textContent = index_element.name;
    b.addEventListener(
        "click",
        (event) => {
            document.getElementById("main-menu").hidden = true;
            open_map(event.target.parentElement.mapID);
        }
    );
    li.appendChild(b);
    return li;
}

function new_map() {
    const name = prompt("Enter map name:", "Untitled");

    if(name) {
        browser.storage.local.get("index").then(
            (items) => {
                let maps_array = items.index;
                if(maps_array == null) {
                    maps_array = [];
                }
    
                map_id = Date.now().toString(36) + Math.floor(Math.random() * 65536).toString(16).padStart(4, "0");
    
                maps_array.push(
                    {
                        id: map_id,
                        name,
                        // locked: false
                    }
                );
    
                browser.storage.local.set(
                    {
                        index: maps_array,
                        [map_id]: {
                            locs: [],
                            locs_extras: [],
                            upload_targets: []
                        }
                    }
                ).then(
                    () => {
                        open_map(map_id);
                    }
                );
            }
        )
    }
}

function pass_object_to_filesystem_as(obj, filename) {
    const json_blob = new Blob(
        [JSON.stringify(obj)],
        { type: "text/plain" }
    );

    const url = URL.createObjectURL(json_blob);

    browser.downloads.download({url, filename}).then(
        (id) => {
            function revoke_this_url_on_complete(downloadDelta) {
                if(
                    downloadDelta.id == id
                    && downloadDelta.state.current == "complete"
                ) {
                    browser.downloads.onChanged.removeListener(
                        revoke_this_url_on_complete
                    );
                    URL.revokeObjectURL(url);
                }
            }

            browser.downloads.onChanged.addListener(
                revoke_this_url_on_complete
            );
        },

        (failure_reason) => {
            console.error(failure_reason);
            URL.revokeObjectURL(url);
        }
    )
}

function dump_all_to_file() {
    browser.storage.local.get("index").then(
        (indexResponse) => {
            const index = indexResponse.index;
            browser.storage.local.get(
                index.map(item => item.id)
            ).then(
                (mapsData) => {
                    mapsData.index = index;
                    pass_object_to_filesystem_as(
                        mapsData, 
                        `GGMMP dump ${
                            (new Date()).toLocaleString("sv").replaceAll(':', '.')
                        }.json`
                    );
                }
            )
        }
    )
}