browser.browserAction.onClicked.addListener(
    (e) => {
        browser.tabs.create( { url: "/editor.html" } );
    }
);