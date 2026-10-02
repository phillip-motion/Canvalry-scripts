// Explode Shape Layers for Cavalry
// Splits each selected shape into one editable shape per contour, keeping its look and transform.
// The original is hidden and renamed, not deleted.

var ORIGINAL_SUFFIX = " (Original)";

function explode(src) {
    var name = api.getNiceName(src);
    var copy = api.makeEditable(src, true);
    var contours = api.getEditablePath(copy, false) || [];
    api.deleteLayer(copy);
    if (contours.length < 2) return [];

    return contours.map(function (c, i) {
        // makeEditable copies fill, stroke, transform and effects, so only the path differs
        var part = api.makeEditable(src, true);
        api.setEditablePath(part, false, [c]);
        api.rename(part, name + " " + (i + 1));
        return part;
    });
}

var selection = api.getSelection().filter(function (id) { return api.isShape(id); });
if (!selection.length) {
    console.warn("Select one or more shapes.");
} else {
    var made = [];
    selection.forEach(function (src) {
        var name = api.getNiceName(src);
        var parts = explode(src);
        if (!parts.length) {
            console.warn("\"" + name + "\" has only one contour, so it was skipped.");
            return;
        }
        api.set(src, { hidden: true });
        api.rename(src, name + ORIGINAL_SUFFIX);
        made = made.concat(parts);
    });
    if (made.length) api.select(made);
    console.log("Exploded into " + made.length + " shape(s).");
}
