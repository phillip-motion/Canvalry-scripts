var selection = api.getSelection();
var comps = selection.length
    ? selection.filter(function (id) { return api.getLayerType(id) === "compNode"; })
    : [api.getActiveComp()];

if (!comps.length) {
    console.warn("Select one or more comps in the Assets panel, or make sure a comp is active.");
} else {
    comps.forEach(function (id) {
        var bg = api.get(id, "backgroundColor");
        api.set(id, { backgroundColor: { r: bg.r, g: bg.g, b: bg.b, a: 0 } });
    });
    console.log("Set background alpha to 0 on " + comps.length + " comp(s).");
}
