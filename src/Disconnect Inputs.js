var selection = api.getSelection();

if (selection.length === 0) {
    console.log("No layers selected.");
} else {
    var disconnected = 0;
    for (var i = 0; i < selection.length; i++) {
        var id = selection[i];
        var inAttrs = api.getInConnectedAttributes(id);
        for (var j = 0; j < inAttrs.length; j++) {
            api.disconnectInput(id, inAttrs[j]);
            disconnected++;
        }
    }
    console.log("Disconnected " + disconnected + " input(s) on " + selection.length + " layer(s).");
}
