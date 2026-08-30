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
        var outAttrs = api.getOutConnectedAttributes(id);
        for (var k = 0; k < outAttrs.length; k++) {
            api.disconnectOutputs(id, outAttrs[k]);
            disconnected++;
        }
    }
    console.log("Disconnected " + disconnected + " connection(s) on " + selection.length + " layer(s).");
}
