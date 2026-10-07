// v4.1 — ⋯ palette menu (Color window actions + Sync Array) replaces the Array button
// Tiny Palette — really simple.
//
//   [ preset dropdown        ][⋯]   ← your presets, then "Add palette…" (name popup).
//                                      ⋯ = the Color window's palette menu, plus
//                                      Sync Array when this comp has the preset's array.
//                                      Presets reload on dropdown hover if changed.
//   [chip][chip][chip][+]            ← the colours, wrapping. Double-click → wheel,
//                                      right-click → delete, [+] adds a colour.
//
// Lists every palette in the library and project palette folders. Editing
// writes back by rebuilding the .pal via api.createPalette(overwrite), keeping
// the palette's own author and website.

ui.setTitle("Tiny Palette");
// Toolbar = no docking tab. Height isn't fixed, so the chips can still wrap.
ui.setToolbar();
var MARGIN = 4;
ui.setMargins(MARGIN, 0, MARGIN, 0);   // sides only; stretches handle vertical space
ui.setSpaceBetween(MARGIN);
var ROW = 22;   // dropdown / ⋯ height

var DEFAULT_NAME = "My Colours";
var DEFAULT_SEED = ["#4a90d9", "#50c878", "#f5a623"];

// ---------- state ----------

var presets = [];      // [{name, scope, path}]
var chips = [];        // live ColorChip widgets, index-aligned with swatches
var suppressWrites = false; // true while rebuilding chips, so setColor doesn't trigger writes

function currentPreset() {
    return presets[presetDropdown.getValue()] || null;
}

// ---------- palette IO ----------

function listPresets() {
    var all = api.listPalettes("all") || [];
    all.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return all.map(function (a) { return { name: a.name, scope: a.scope, path: a.path }; });
}

function ensureDefaultPreset() {
    if (listPresets().length > 0) return;
    try {
        api.createPalette(DEFAULT_NAME, "library", DEFAULT_SEED);
        console.log("Tiny Palette: created starter preset '" + DEFAULT_NAME + "'");
    } catch (e) {
        console.error("Tiny Palette: could not create starter preset — " + e);
    }
}

function readSwatches(p) {
    if (!p) return [];
    var pal = api.getPalette(p.name, p.scope);
    if (!pal) return [];
    return (pal.swatches || []).map(function (s) {
        return { name: s.name || "", hex: s.hex };
    });
}

// Rebuild the .pal from the chips' current colours, preserving swatch names
// and metadata. This is the only write path — there's no in-place
// swatch-update API. Round-trip (order, names, author) verified 2026-08-07.
function writeBack(p) {
    if (!p) return;
    var pal = api.getPalette(p.name, p.scope);
    if (!pal) return;
    var swatches = [];
    for (var i = 0; i < chips.length; i++) {
        var name = (pal.swatches && pal.swatches[i] && pal.swatches[i].name) || "";
        swatches.push({ color: chips[i].getColor(), name: name });
    }
    try {
        api.createPalette(p.name, p.scope, swatches, {
            author: pal.author || "",
            website: pal.website || "",
            overwrite: true,
        });
        setStatus("Saved '" + p.name + "'");
    } catch (e) {
        setStatus("Could not save '" + p.name + "'");
        console.error("Tiny Palette: could not save '" + p.name + "' — " + e);
    }
}

// ---------- UI ----------

// Chips wrap in a FlowLayout. A FlowLayout has no height of its own, so it
// lives in a Container whose fixed height is re-measured for the current width
// (on rebuild and on resize). A Container ignores a second setLayout, so the
// host keeps one slot layout and each rebuild swaps a fresh Container into it.
var CHIP = 22, GAP = 4;
var chipHost = new ui.Container();
var chipSlot = new ui.VLayout();
chipSlot.setMargins(0, 0, 0, 0);
chipHost.setLayout(chipSlot);
var chipFlow = null;

function fitChips() {
    var size = ui.size();
    var w = Math.max(CHIP, (size.width || size.x || 0) - MARGIN * 2);
    var h = chipFlow ? chipFlow.getHeightForWidth(w) : 0;
    if (h > 0) chipHost.setFixedHeight(h);
}

var presetDropdown = new ui.DropDown();
presetDropdown.setFixedHeight(ROW);
var lastIndex = 0;     // last real preset index, restored after "Add palette…"

function setStatus(text) {
    if (text) console.log("Tiny Palette: " + text);
}

var menuButton = new ui.Button("⋯");
menuButton.setFixedWidth(ROW);
menuButton.setFixedHeight(ROW);
menuButton.setToolTip("Palette options");

// Outlined "+" tile, same size as a chip, always last in the flow. Drawn on a
// canvas because Container.setBorder ignores the corner radius.
var TILE_RADIUS = 3;

function drawAddTile(canvas, color) {
    var w = 2, i = w / 2, s = CHIP - w, r = TILE_RADIUS, k = r * 0.5523;
    var box = new cavalry.Path();
    box.moveTo(i + r, i);
    box.lineTo(i + s - r, i);
    box.cubicTo(i + s - r + k, i, i + s, i + r - k, i + s, i + r);
    box.lineTo(i + s, i + s - r);
    box.cubicTo(i + s, i + s - r + k, i + s - r + k, i + s, i + s - r, i + s);
    box.lineTo(i + r, i + s);
    box.cubicTo(i + r - k, i + s, i, i + s - r + k, i, i + s - r);
    box.lineTo(i, i + r);
    box.cubicTo(i, i + r - k, i + r - k, i, i + r, i);
    box.close();
    var c = CHIP / 2, arm = 5;
    var plus = new cavalry.Path();
    plus.moveTo(c - arm, c); plus.lineTo(c + arm, c);
    plus.moveTo(c, c - arm); plus.lineTo(c, c + arm);
    canvas.clearPaths();
    canvas.addPath(box.toObject(), { "color": color, "stroke": true, "strokeWidth": w });
    canvas.addPath(plus.toObject(), { "color": color, "stroke": true, "strokeWidth": w });
    canvas.redraw();
}

function makeAddTile() {
    var line = "#c8c8c8", hoverLine = "#ffffff";
    var canvas = new ui.Draw();
    canvas.setSize(CHIP, CHIP);
    canvas.setFixedWidth(CHIP);
    canvas.setFixedHeight(CHIP);
    // Otherwise the canvas swallows the mouse and the Container never sees it.
    canvas.setTransparentForMouseEvents(true);
    drawAddTile(canvas, line);

    var row = new ui.HLayout();
    row.setMargins(0, 0, 0, 0);
    row.add(canvas);

    var tile = new ui.Container();
    tile.setFixedWidth(CHIP);
    tile.setFixedHeight(CHIP);
    tile.setLayout(row);
    tile.setToolTip("Add a colour to this preset");
    tile.useHoverEvents(true);
    tile.onMouseEnter = function () { drawAddTile(canvas, hoverLine); };
    tile.onMouseLeave = function () { drawAddTile(canvas, line); };
    tile.onMousePress = function (pos, button) { if (button === "left") addColour(); };
    return tile;
}

// Right-click a chip → delete it. The chip sits in a Container because the
// native ColorChip has no mouse callbacks of its own.
function wrapChip(chip, index) {
    var row = new ui.HLayout();
    row.setMargins(0, 0, 0, 0);
    row.add(chip);
    var box = new ui.Container();
    box.setFixedWidth(CHIP);
    box.setFixedHeight(CHIP);
    box.setLayout(row);
    box.onMousePress = function (pos, button) {
        if (button !== "right") return;
        ui.clearContextMenu();
        ui.addMenuItem({
            name: "Delete colour",
            enabled: chips.length > 1,
            onMouseRelease: function () { deleteColour(index); }
        });
        ui.showContextMenu();
    };
    return box;
}

function rebuildChips() {
    suppressWrites = true;
    chipFlow = new ui.FlowLayout(GAP, GAP);
    chipFlow.setSpaceBetween(GAP);
    chipFlow.setMargins(0, 0, 0, 0);
    chips = [];
    var p = currentPreset();
    if (p) {
        var swatches = readSwatches(p);
        for (var i = 0; i < swatches.length; i++) {
            (function (sw, idx) {
                var chip = new ui.ColorChip();
                chip.setSize(CHIP, CHIP);
                chip.setColor(sw.hex);
                chip.setAcceptsDrops(true);
                chip.setToolTip((sw.name ? sw.name + " · " : "") + sw.hex + "  (double-click for wheel, right-click to delete)");
                chip.onValueChanged = function () {
                    if (suppressWrites) return;
                    writeBack(currentPreset());
                };
                chipFlow.add(wrapChip(chip, idx));
                chips.push(chip);
            })(swatches[i], i);
        }
        chipFlow.add(makeAddTile());
    }
    var box = new ui.Container();
    box.setLayout(chipFlow);
    chipSlot.clear();
    chipSlot.add(box);
    fitChips();
    suppressWrites = false;
}

// Names + colours of every owned preset, to tell whether a reload is needed.
var lastFingerprint = "";
function fingerprint(list) {
    return JSON.stringify(list.map(function (p) { return [p.name, p.scope, readSwatches(p)]; }));
}

function refreshPresets(keepName) {
    var prev = keepName || (currentPreset() && currentPreset().name);
    ensureDefaultPreset();
    presets = listPresets();
    lastFingerprint = fingerprint(presets);
    presetDropdown.clear();
    for (var i = 0; i < presets.length; i++) {
        var label = presets[i].name + (presets[i].scope === "project" ? " (project)" : "");
        presetDropdown.addEntry(label);
    }
    presetDropdown.insertSeparator(presets.length);
    presetDropdown.addEntry("Add palette…");
    var idx = 0;
    if (prev) {
        for (var j = 0; j < presets.length; j++) {
            if (presets[j].name === prev) { idx = j; break; }
        }
    }
    if (presets.length > 0) presetDropdown.setValue(idx);
    lastIndex = idx;
    rebuildChips();
}

function addColour() {
    var p = currentPreset();
    if (!p) return;
    try {
        api.addSwatchToPalette(p.name, "#808080", undefined, p.scope);
        rebuildChips();
        setStatus("Added a colour — double-click it to set the colour");
    } catch (e) {
        setStatus("Could not add colour");
        console.error("Tiny Palette: could not add colour — " + e);
    }
}

function deleteColour(index) {
    var p = currentPreset();
    if (!p) return;
    if (chips.length <= 1) { setStatus("Can't remove the last colour"); return; }
    try {
        api.removeSwatchFromPalette(p.name, index, p.scope);
        rebuildChips();
        setStatus("Removed");
    } catch (e) {
        setStatus("Could not remove colour");
        console.error("Tiny Palette: could not remove colour — " + e);
    }
}

// ---------- "Add palette…" ----------

function createPalette() {
    var name = (new ui.Modal().showStringInput("Add palette", "Name", "") || "").trim();
    if (!name) return;   // cancelled or blank
    // Auto-unique the name ("Name", "Name 2", "Name 3"…).
    var taken = {};
    var all = api.listPalettes("all") || [];
    for (var t = 0; t < all.length; t++) taken[all[t].name.toLowerCase()] = true;
    var unique = name, n = 2;
    while (taken[unique.toLowerCase()]) { unique = name + " " + n; n++; }
    try {
        api.createPalette(unique, "library", DEFAULT_SEED);
        refreshPresets(unique);
        setStatus("Created '" + unique + "'");
    } catch (e) {
        setStatus("Could not create palette");
        console.error("Tiny Palette: could not create palette — " + e);
    }
}

presetDropdown.onValueChanged = function () {
    if (presetDropdown.getValue() > presets.length) {   // the "Add palette…" entry
        presetDropdown.setValue(lastIndex);
        createPalette();
        return;
    }
    lastIndex = presetDropdown.getValue();
    rebuildChips();
};

// ---------- colorArray link ----------
// Arrays made here are tagged with user data naming their preset, so the
// menu can offer "Sync Array" for this preset's array in the active comp.
var ARRAY_KEY = "tinyPalette";

function findArray(p) {
    if (!p) return null;
    var ids = api.getCompLayersOfType(false, "colorArray") || [];
    for (var i = 0; i < ids.length; i++) {
        if (api.hasUserDataKey(ids[i], ARRAY_KEY) && api.getUserDataKey(ids[i], ARRAY_KEY) === p.name) return ids[i];
    }
    return null;
}

// Rewrite the array's colours in place, so its connections survive.
function syncArray(id, p) {
    var colours = readSwatches(p).map(function (s) { return s.hex; });
    var count = api.get(id, "count");
    for (; count < colours.length; count++) api.addArrayIndex(id, "array");
    for (; count > colours.length; count--) api.removeArrayIndex(id, "array." + (count - 1));
    var values = {};
    for (var i = 0; i < colours.length; i++) values["array." + i] = colours[i];
    api.set(id, values);
}

function createArray(p) {
    var id = api.createColorArrayFromPalette(p.name, p.scope);
    if (!id) { setStatus("Could not create colorArray"); return; }
    api.setUserData(id, ARRAY_KEY, p.name);
    api.rename(id, p.name);
    api.select([id]);
    setStatus("colorArray created from '" + p.name + "'");
}

// ---------- ⋯ menu ----------
// Mirrors the Color window's palette menu, using Cavalry's own icons.

var ICONS = api.getAppAssetsPath() + "/icons/";

function toHex(c) {
    if (typeof c === "string") return c;
    return "#" + [c.r, c.g, c.b].map(function (v) { return (v < 16 ? "0" : "") + v.toString(16); }).join("");
}

// Swatches as createPalette input, keeping names.
function swatchObjects(p) {
    return readSwatches(p).map(function (s) { return { color: s.hex, name: s.name }; });
}

// Selected attributes as [{layer, attr}]. The return shape isn't documented,
// so accept both "layerId.attrId" strings and {layerId: [attrIds]}.
function selectedAttributes() {
    var sel = api.getSelectedAttributes() || [], out = [];
    if (Array.isArray(sel)) {
        sel.forEach(function (path) {
            var dot = String(path).indexOf(".");
            if (dot > 0) out.push({ layer: path.slice(0, dot), attr: path.slice(dot + 1) });
        });
    } else {
        Object.keys(sel).forEach(function (layer) {
            [].concat(sel[layer]).forEach(function (attr) { out.push({ layer: layer, attr: attr }); });
        });
    }
    return out;
}

function importPalette() {
    var file = ui.chooseFileToOpen("", "Palettes (*.pal *.ase *.theme)");
    if (!file) return;
    try {
        api.importPalette(file, "library");
        refreshPresets(api.getFileNameFromPath(file, false));
        setStatus("Imported '" + api.getFileNameFromPath(file, true) + "'");
    } catch (e) { console.error("Tiny Palette: could not import — " + e); }
}

function saveAs(p) {
    var ext = api.getExtensionFromPath(p.path).replace(/^\./, "");
    var file = ui.chooseFileToSave("", "Palette (*." + ext + ")");
    if (!file) return;
    // ponytail: text copy; fine for .pal, binary .ase would need encodeBinary.
    if (api.writeToFile(file, api.readFromFile(p.path), true)) setStatus("Saved a copy to " + file);
    else console.error("Tiny Palette: could not save to " + file);
}

// No rename API: write the palette under the new name, delete the old one,
// and move any colorArray tags over so ↻ Sync keeps working.
function renamePalette(p) {
    var name = (new ui.Modal().showStringInput("Rename palette", "Name", p.name) || "").trim();
    if (!name || name === p.name) return;
    var pal = api.getPalette(p.name, p.scope);
    try {
        api.createPalette(name, p.scope, swatchObjects(p), { author: pal.author || "", website: pal.website || "" });
        api.deletePalette(p.name, p.scope);
        var arr = findArray(p);
        if (arr) { api.setUserData(arr, ARRAY_KEY, name); api.rename(arr, name); }
        refreshPresets(name);
        setStatus("Renamed to '" + name + "'");
    } catch (e) { console.error("Tiny Palette: could not rename — " + e); }
}

function addColoursFromSelection(p) {
    var seen = {};
    readSwatches(p).forEach(function (s) { seen[s.hex.toLowerCase()] = true; });
    var added = 0;
    (api.getSelection() || []).forEach(function (id) {
        try {
            var hex = toHex(api.get(id, "material.materialColor")).toLowerCase();
            if (!seen[hex]) { api.addSwatchToPalette(p.name, hex, undefined, p.scope); seen[hex] = true; added++; }
        } catch (e) { /* layer has no fill */ }
    });
    rebuildChips();
    setStatus(added ? "Added " + added + " colour(s) from selection" : "No new colours in selection");
}

function setGradient(p) {
    var done = 0;
    selectedAttributes().forEach(function (a) {
        try { if (api.setGradientFromPalette(a.layer, a.attr, p.name, p.scope)) done++; } catch (e) {}
    });
    setStatus(done ? "Set " + done + " gradient(s) from '" + p.name + "'" : "Select a gradient attribute first");
}

function clearPalette(p) {
    if (!new ui.Modal().showConfirmation("Clear palette", "Remove every colour from '" + p.name + "'?")) return;
    try {
        for (var i = readSwatches(p).length - 1; i >= 0; i--) api.removeSwatchFromPalette(p.name, i, p.scope);
        rebuildChips();
        setStatus("Cleared '" + p.name + "'");
    } catch (e) { console.error("Tiny Palette: could not clear — " + e); }
}

function deletePalette(p) {
    if (!new ui.Modal().showConfirmation("Delete palette", "Delete '" + p.name + "'? This can't be undone.")) return;
    if (api.deletePalette(p.name, p.scope)) { refreshPresets(); setStatus("Deleted '" + p.name + "'"); }
    else console.error("Tiny Palette: could not delete '" + p.name + "'");
}

function showPaletteMenu() {
    var p = currentPreset();
    var has = !!p;
    var arr = has ? findArray(p) : null;
    function item(name, icon, fn, enabled) {
        ui.addMenuItem({ name: name, icon: ICONS + icon, enabled: enabled !== false,
            onMouseRelease: function () { fn(p); } });
    }
    function sep() { ui.addMenuItem({ name: "" }); }

    ui.clearContextMenu();
    item("New Palette…", "newPalette.png", createPalette);
    sep();
    item("Import…", "importPalette.png", importPalette);
    item("Save As…", "save.png", saveAs, has);
    sep();
    item("Rename Palette…", "context-menus/rename.png", renamePalette, has);
    sep();
    item("Add Colors from Selection", "addColorsFromSelection.png", addColoursFromSelection,
        has && (api.getSelection() || []).length > 0);
    sep();
    item("Set Gradient From Palette", "setGradientFromPalette.png", setGradient, has && selectedAttributes().length > 0);
    item("Create Array From Palette", "createArrayFromPalette.png", createArray, has);
    if (arr) {
        item("Sync Array", "context-menus/reload.png", function (p) {
            try { syncArray(arr, p); setStatus("Synced colorArray with '" + p.name + "'"); }
            catch (e) { console.error("Tiny Palette: could not sync colorArray — " + e); }
        });
    }
    sep();
    item("Clear Palette", "palette_clearPalette.png", clearPalette, has);
    item("Delete Palette", "bin.png", deletePalette, has);
    ui.showContextMenu();
}

menuButton.onClick = showPaletteMenu;

// ---------- layout ----------

// No palette-changed callback and no dropdown-open event, so reload when the
// mouse reaches the dropdown — just before a click — if anything changed on disk
// (e.g. edited in Cavalry's own palette window).
var dropdownRow = new ui.HLayout();
dropdownRow.setMargins(0, 0, 0, 0);
dropdownRow.add(presetDropdown);
var dropdownHost = new ui.Container();
dropdownHost.setLayout(dropdownRow);
dropdownHost.useHoverEvents(true);
dropdownHost.onMouseEnter = function () {
    if (fingerprint(listPresets()) !== lastFingerprint) refreshPresets();
};
var topRow = new ui.HLayout();
topRow.setMargins(0, 0, 0, 0);
topRow.add(dropdownHost);
topRow.add(menuButton);

// Stretch above and below centres the content in a taller toolbar.
ui.addStretch();
ui.add(topRow);
ui.add(chipHost);
ui.addStretch();

ui.onResize = fitChips;

refreshPresets();
ui.show();
fitChips();   // the window has its real width only once shown
