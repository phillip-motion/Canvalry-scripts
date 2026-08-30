var selection = api.getSelection();

if (selection.length === 0) {
    console.log("No layers selected.");
} else {
    var disconnected = 0;
    for (var i = 0; i < selection.length; i++) {
        var id = selection[i];
        var outAttrs = api.getOutConnectedAttributes(id);
        for (var j = 0; j < outAttrs.length; j++) {
            api.disconnectOutputs(id, outAttrs[j]);
            disconnected++;
        }
    }
    console.log("Disconnected " + disconnected + " output(s) on " + selection.length + " layer(s).");
}
