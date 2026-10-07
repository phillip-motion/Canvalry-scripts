// v4.0 — compact: no min size, native + Array / ↻ Array button beside the dropdown
// Tiny Palette — really simple.
//
//   [ preset dropdown     ][+ Array] ← your presets, then "Add palette…" (name popup).
//                                      + Array creates a colorArray; once this comp
//                                      has one it reads ↻ Array and syncs it.
//                                      Presets reload on dropdown hover if changed.
//   [chip][chip][chip][+]            ← the colours, wrapping. Double-click → wheel,
//                                      right-click → delete, [+] adds a colour.
//
// Editing writes back by rebuilding the .pal via api.createPalette(overwrite).
// Presets are stamped metadata.author = "Palette Panel"; factory palettes
// (Alice, Bright, Canva Color…) stay hidden.

ui.setTitle("Tiny Palette");
var MARGIN = 4;
ui.setMargins(MARGIN, MARGIN, MARGIN, MARGIN);

// ponytail: author tag keeps its old name so existing presets stay visible.
var OWNED_AUTHOR = "Palette Panel";
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

function listMyPresets() {
    var all = api.listPalettes("all") || [];
    all.sort(function (a, b) { return a.name.localeCompare(b.name); });
    var out = [];
    for (var i = 0; i < all.length; i++) {
        var pal = api.getPalette(all[i].name, all[i].scope);
        if (pal && pal.author === OWNED_AUTHOR) {
            out.push({ name: all[i].name, scope: all[i].scope, path: all[i].path });
        }
    }
    return out;
}

function ensureDefaultPreset() {
    if (listMyPresets().length > 0) return;
    try {
        api.createPalette(DEFAULT_NAME, "library", DEFAULT_SEED, { author: OWNED_AUTHOR });
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
            author: OWNED_AUTHOR,
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
var CHIP = 24, GAP = 4;
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
var lastIndex = 0;     // last real preset index, restored after "Add palette…"

function setStatus(text) {
    if (text) console.log("Tiny Palette: " + text);
}

var arrayButton = new ui.Button("+ Array");

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
    presets = listMyPresets();
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
    updateArrayButton();
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
        api.createPalette(unique, "library", DEFAULT_SEED, { author: OWNED_AUTHOR });
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
    updateArrayButton();
};

// ---------- colorArray link ----------
// Arrays made here are tagged with user data naming their preset, so the
// button can find "this preset's array" in the active comp.
var ARRAY_KEY = "tinyPalette";

function findArray(p) {
    if (!p) return null;
    var ids = api.getCompLayersOfType(false, "colorArray") || [];
    for (var i = 0; i < ids.length; i++) {
        if (api.hasUserDataKey(ids[i], ARRAY_KEY) && api.getUserDataKey(ids[i], ARRAY_KEY) === p.name) return ids[i];
    }
    return null;
}

function updateArrayButton() {
    if (findArray(currentPreset())) {
        arrayButton.setText("↻ Array");
        arrayButton.setToolTip("Update this comp's colorArray to match the preset");
    } else {
        arrayButton.setText("+ Array");
        arrayButton.setToolTip("Create a colorArray layer from this preset");
    }
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

arrayButton.onClick = function () {
    var p = currentPreset();
    if (!p) return;
    var existing = findArray(p);
    if (existing) {
        try {
            syncArray(existing, p);
            setStatus("Synced colorArray with '" + p.name + "'");
        } catch (e) {
            console.error("Tiny Palette: could not sync colorArray — " + e);
        }
        return;
    }
    var id = api.createColorArrayFromPalette(p.name, p.scope);
    if (id) {
        api.setUserData(id, ARRAY_KEY, p.name);
        api.rename(id, p.name);
        api.select([id]);
        setStatus("colorArray created from '" + p.name + "'");
    } else {
        setStatus("Could not create colorArray");
    }
    updateArrayButton();
};

// Re-check when the comp changes or a layer goes (e.g. the array is deleted).
function Callbacks() {
    this.onCompChanged = updateArrayButton;
    this.onLayerRemoved = updateArrayButton;
}
ui.addCallbackObject(new Callbacks());

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
    if (fingerprint(listMyPresets()) !== lastFingerprint) refreshPresets();
};
var topRow = new ui.HLayout();
topRow.setMargins(0, 0, 0, 0);
topRow.add(dropdownHost);
topRow.add(arrayButton);

ui.add(topRow);
ui.add(chipHost);
ui.addStretch();

ui.onResize = fitChips;

refreshPresets();
ui.show();
fitChips();   // the window has its real width only once shown
