var selection = api.getSelection();

if (selection.length === 0) {
    console.log("No assets selected.");
} else {
    var revealed = 0;
    for (var i = 0; i < selection.length; i++) {
        var id = selection[i];
        if (!api.isFileAsset(id)) {
            continue;
        }
        try {
            var filePath = api.getAssetFilePath(id);
            if (!filePath || filePath === "") {
                console.log("No file path for: " + api.getNiceName(id));
                continue;
            }
            api.runProcess("open", ["-R", filePath]);
            revealed++;
        } catch (e) {
            console.log("Could not reveal " + api.getNiceName(id) + ": " + e);
        }
    }
    if (revealed === 0) {
        console.log("No file assets in selection to reveal.");
    }
}
