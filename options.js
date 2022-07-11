let update_button;

window.onload = () => {
    update_button = document.getElementById("update-button");
    update_button.onclick = update;
    browser.storage.local.get("Ak").then(
        (ob) => {
            document.getElementById("field").value = ob.Ak;
            update_button.disabled = false;
        }
    )
}


function update() {
    update_button.disabled = true;
    browser.storage.local.set(
        { Ak: document.getElementById("field").value }
    ).then(
        () => {
            update_button.disabled = false;
        }
    );
}

