import { tokens, button, checkRow, panel } from "./lib/ui-kit.js";

// Points to Nulls for Cavalry
// Creates a null per vertex of the selected shape and a live output shape driven by them.

var ANCHOR_COLOUR = { r: 255, g: 170, b: 0, a: 255 };
var HANDLE_COLOUR = { r: 0, g: 200, b: 255, a: 255 };
var ORIGINAL_SUFFIX = " (Original)";
var LOOK = /^(material|stroke)\./;
var TRANSFORM_CHANNELS = ["position.x", "position.y", "position.z", "rotation.x", "rotation.y", "rotation.z",
    "scale.x", "scale.y", "skew.x", "skew.y", "pivot.x", "pivot.y"];
var SHAPE_ATTRS = ["opacity", "blendMode", "motionBlur", "featherAmount", "featherMasks", "clippingMode", "matteMode", "is3d"];
var LISTS = ["filters", "deformers", "masks", "trackMattes"];

function splitRef(ref) {
    var dot = ref.indexOf(".");
    return { id: ref.slice(0, dot), attr: ref.slice(dot + 1) };
}

function setOne(id, attr, value) {
    var o = {};
    o[attr] = value;
    api.set(id, o);
}

// api.parent keeps the world transform, so zero the compensating offsets afterwards
function adopt(id, parent) {
    api.parent(id, parent);
    api.set(id, { position: [0, 0], rotation: [0, 0, 0], scale: [1, 1], skew: [0, 0] });
}

function makeNull(name, parent, x, y, colour) {
    var id = api.create("null", name);
    adopt(id, parent);
    api.set(id, { position: [x, y], customColor: true, nullColor: colour });
    return id;
}

function copyAttrs(from, to, attrs) {
    attrs.forEach(function (a) {
        var v = api.get(from, a);
        if (v !== null && v !== undefined) setOne(to, a, v);
    });
}

// Passing an expression (even "") switches magic easing to Custom, so only pass it for Custom
function applyEasing(id, attr, frame, e) {
    if (e.easingName === "Custom") api.magicEasing(id, attr, frame, "Custom", e.expression);
    else api.magicEasing(id, attr, frame, e.easingName);
}

// Copies keyframes and magic easing for one channel. Returns true if the channel was animated.
function copyKeys(from, attr, to, toAttr) {
    var times = api.getKeyframeTimes(from, attr) || [];
    if (!times.length) return false;
    times.forEach(function (f) {
        api.setFrame(f);
        var o = {};
        o[toAttr || attr] = api.get(from, attr);
        api.keyframe(to, f, o);
    });
    times.forEach(function (f) {
        var e = api.getMagicEasing(from, attr, f);
        if (e) applyEasing(to, toAttr || attr, f, e);
    });
    return true;
}

// Transform: static values, then keyframes, then any live drivers (behaviours etc.)
function copyTransform(src, group) {
    copyAttrs(src, group, ["position", "rotation", "scale", "skew", "pivot", "is3d"]);
    TRANSFORM_CHANNELS.forEach(function (c) { copyKeys(src, c, group); });
    api.getInConnectedAttributes(src).forEach(function (a) {
        if (!/^(position|rotation|scale|skew|pivot)(\.|$)/.test(a)) return;
        var from = splitRef(api.getInConnection(src, a));
        api.connect(from.id, from.attr, group, a);
    });
}

// Copies fill/stroke/shape values and keyframes, then re-wires incoming connections (swatches, shaders, behaviours)
function copyLook(src, out) {
    api.setFill(out, api.hasFill(src));
    api.setStroke(out, api.hasStroke(src));
    var connected = api.getInConnectedAttributes(src).filter(function (a) {
        return LOOK.test(a) || SHAPE_ATTRS.indexOf(a) >= 0;
    });
    var values = api.getAttributes(src).filter(function (a) {
        return LOOK.test(a) && !/colorShaders/.test(a) && connected.indexOf(a) < 0;
    }).concat(SHAPE_ATTRS.filter(function (a) { return connected.indexOf(a) < 0; }));
    copyAttrs(src, out, values);
    var animated = values.filter(function (a) { return copyKeys(src, a, out); });
    connected.forEach(function (a) {
        var from = splitRef(api.getInConnection(src, a));
        // Shader list entries (x.colorShaders.N.shader) append to the bare list
        api.connect(from.id, from.attr, out, a.replace(/\.colorShaders\.\d+\.shader$/, ".colorShaders"));
    });
    var landed = api.getInConnectedAttributes(out).filter(function (a) {
        return LOOK.test(a) || SHAPE_ATTRS.indexOf(a) >= 0;
    }).length;
    if (landed < connected.length) console.warn((connected.length - landed) + " fill/stroke connection(s) could not be copied.");
    return animated.length;
}

// Moves a list (filters, deformers, masks, track mattes) in order, with per-entry settings.
// Disconnecting re-indexes the list, so read everything first and disconnect from the end.
function moveList(from, to, list) {
    var re = new RegExp("^" + list + "\\.(\\d+)(\\.id)?$");
    var items = api.getInConnectedAttributes(from)
        .filter(function (a) { return re.test(a); })
        .sort(function (a, b) { return a.split(".")[1] - b.split(".")[1]; })
        .map(function (a) {
            var m = re.exec(a), extra = {};
            if (m[2]) {
                ["enabled", "mode"].forEach(function (k) {
                    var v = api.get(from, list + "." + m[1] + "." + k);
                    if (v !== null && v !== undefined) extra[k] = v;
                });
            }
            var src = splitRef(api.getInConnection(from, a));
            return { attr: a, id: src.id, out: src.attr, extra: extra };
        });
    items.slice().reverse().forEach(function (x) { api.disconnect(x.id, x.out, from, x.attr); });
    var base = api.getInConnectedAttributes(to).filter(function (a) { return re.test(a); }).length;
    items.forEach(function (x, k) {
        api.connect(x.id, x.out, to, list);
        Object.keys(x.extra).forEach(function (key) { setOne(to, list + "." + (base + k) + "." + key, x.extra[key]); });
    });
    return items.length;
}

// Points every downstream user of `from` (duplicators, connect shapes, other layers' masks) at `to`.
// Force-connecting in place keeps list slots in their original order.
function rewireOutputs(from, to) {
    var moved = [];
    api.getOutConnectedAttributes(from).forEach(function (a) {
        (api.getOutConnections(from, a) || []).forEach(function (ref) {
            var dst = splitRef(ref);
            api.connect(to, a, dst.id, dst.attr, true);
            moved.push({ attr: a, id: dst.id, dstAttr: dst.attr });
        });
    });
    return moved;
}

// Reads contours with handle offsets relative to their vertex
function readContours(id) {
    return (api.getEditablePath(id, false) || []).map(function (c) {
        c.points.forEach(function (p) {
            p.i = p.hasInHandle ? [p.inHandle.x - p.position.x, p.inHandle.y - p.position.y] : [0, 0];
            p.o = p.hasOutHandle ? [p.outHandle.x - p.position.x, p.outHandle.y - p.position.y] : [0, 0];
        });
        return c;
    });
}

function topology(contours) {
    return contours.map(function (c) { return c.points.length + (c.isClosed ? "c" : "o"); }).join(",");
}

function isCurved(contours) {
    return contours.some(function (c) {
        return c.points.some(function (p) { return p.i[0] || p.i[1] || p.o[0] || p.o[1]; });
    });
}

// Keys every null at each path keyframe, copying magic easing, then checks segment midpoints.
// Falls back to a key per frame if the easing couldn't be reproduced (e.g. custom bezier tangents).
function bakePathKeys(pathSrc, rig, times, keep, withHandles) {
    function keyAt(f) {
        api.setFrame(f);
        var cs = readContours(pathSrc).filter(function (c, ci) { return keep[ci]; });
        rig.forEach(function (verts, ci) {
            verts.forEach(function (v, i) {
                var p = cs[ci].points[i];
                api.keyframe(v.a, f, { "position.x": p.position.x, "position.y": p.position.y });
                if (withHandles) {
                    api.keyframe(v.i, f, { "position.x": p.i[0], "position.y": p.i[1] });
                    api.keyframe(v.o, f, { "position.x": p.o[0], "position.y": p.o[1] });
                }
            });
        });
    }
    function eachNull(fn) {
        rig.forEach(function (verts) {
            verts.forEach(function (v) { [v.a, v.i, v.o].forEach(function (n) { if (n) fn(n); }); });
        });
    }
    times.forEach(keyAt);
    times.forEach(function (f) {
        var e = api.getMagicEasing(pathSrc, "inputPath", f);
        if (!e) return;
        eachNull(function (n) {
            applyEasing(n, "position.x", f, e);
            applyEasing(n, "position.y", f, e);
        });
    });

    // Sample a third of the way in: symmetric eases match linear at the midpoint
    var bad = false;
    for (var k = 0; k < times.length - 1 && !bad; k++) {
        api.setFrame(times[k] + Math.max(1, Math.round((times[k + 1] - times[k]) / 3)));
        var cs = readContours(pathSrc).filter(function (c, ci) { return keep[ci]; });
        bad = rig.some(function (verts, ci) {
            return verts.some(function (v, i) {
                var p = cs[ci].points[i].position, q = api.get(v.a, "position");
                return Math.abs(p.x - q.x) > 0.01 || Math.abs(p.y - q.y) > 0.01;
            });
        });
    }
    if (bad) {
        console.warn("Path easing couldn't be matched exactly, so the nulls are keyed on every frame.");
        for (var f = times[0]; f <= times[times.length - 1]; f++) keyAt(f);
        eachNull(function (n) {
            for (var g = times[0]; g <= times[times.length - 1]; g++) {
                api.magicEasing(n, "position.x", g, "None");
                api.magicEasing(n, "position.y", g, "None");
            }
        });
    }
}

function pointsToNulls(retain) {
    var sel = api.getSelection();
    if (sel.length !== 1 || !api.isShape(sel[0])) {
        console.warn("Select a single shape.");
        return;
    }
    var src = sel[0];
    var name = api.getNiceName(src);
    if (api.get(src, "hidden") && name.slice(-ORIGINAL_SUFFIX.length) === ORIGINAL_SUFFIX) {
        console.warn("\"" + name + "\" has already been converted. Select its output shape instead.");
        return;
    }

    var startFrame = api.getFrame();
    var wasHidden = !!api.get(src, "hidden");
    var created = [];    // layers to delete on failure
    var undo = [];       // other changes to reverse on failure
    try {
        // Non-editable shapes: read geometry from a temporary editable copy
        var pathSrc = src;
        if (api.getLayerType(src) !== "editableShape") {
            pathSrc = api.makeEditable(src, true);
            created.push(pathSrc);
            console.warn("\"" + name + "\" isn't an Editable Shape, so its current-frame geometry was used. Animated shape settings aren't carried over.");
        }

        var all = readContours(pathSrc);
        var keep = all.map(function (c) { return c.points.length >= 2; });
        var contours = all.filter(function (c, ci) { return keep[ci]; });
        if (contours.length < all.length) console.warn((all.length - contours.length) + " contour(s) with fewer than two vertices were skipped.");
        if (!contours.length) throw new Error("The path needs at least two vertices.");

        // Path keyframes: only bake if every key has the same vertex layout
        var times = pathSrc === src ? (api.getKeyframeTimes(src, "inputPath") || []) : [];
        var samples = times.map(function (f) { api.setFrame(f); return readContours(src).filter(function (c, ci) { return keep[ci]; }); });
        api.setFrame(startFrame);
        if (times.length > 1 && samples.some(function (s) { return topology(s) !== topology(contours); })) {
            console.warn("The path's vertex count changes between keyframes, so only the current frame was converted.");
            times = [];
        }
        var animated = times.length > 1;

        var multi = contours.length > 1;
        var curved = isCurved(contours) || samples.some(isCurved);
        var withHandles = retain && curved;
        var native = !multi && !withHandles;

        // Rig group matching the source transform, so local vertex coords carry straight across
        var group = api.create("group", name + " Rig");
        created.push(group);
        var parent = api.getParent(src);
        if (parent) api.parent(group, parent);
        copyTransform(src, group);

        // rig[c] = [{a, i, o}] per vertex
        var rig = contours.map(function (c, ci) {
            return c.points.map(function (p, i) {
                var label = (multi ? (ci + 1) + "." : "") + (i + 1);
                var a = makeNull("Anchor " + label, group, p.position.x, p.position.y, ANCHOR_COLOUR);
                if (!withHandles) return { a: a };
                return {
                    a: a,
                    i: makeNull("In " + label, a, p.i[0], p.i[1], HANDLE_COLOUR),
                    o: makeNull("Out " + label, a, p.o[0], p.o[1], HANDLE_COLOUR)
                };
            });
        });
        if (animated) bakePathKeys(src, rig, times, keep, withHandles);
        api.setFrame(startFrame);

        var out;
        if (native) {
            // Native route: one straight contour
            out = api.create("pointsToCurve", name);
            adopt(out, group);
            api.set(out, { bezier: false, close: !!contours[0].isClosed });
            rig[0].forEach(function (v, i) {
                api.connect(v.a, "position", out, "generator.array." + i);
            });
            var linked = api.getInConnectedAttributes(out).length;
            if (linked !== rig[0].length) throw new Error("Could only connect " + linked + " of " + rig[0].length + " anchors.");
        } else {
            // JS Shape route: every contour in one cavalry.Path; handles are offsets from their anchor
            out = api.create("javaScriptShape", name);
            adopt(out, group);
            var slot = function (id) {
                var s = api.addDynamic(out, "generator.array", "double2");
                api.connect(id, "position", out, "generator." + s);
                return "n" + s.split(".")[1];
            };
            var data = rig.map(function (verts, ci) {
                return "{c:" + !!contours[ci].isClosed + ",v:[" + verts.map(function (v) {
                    return withHandles ? "[" + slot(v.a) + "," + slot(v.i) + "," + slot(v.o) + "]" : "[" + slot(v.a) + "]";
                }) + "]}";
            });
            api.set(out, {
                "generator.expression": [
                    "var C=[" + data + "];",
                    "var p=new cavalry.Path();",
                    "C.forEach(function(c){var v=c.v;p.moveTo(v[0][0].x,v[0][0].y);",
                    "var n=c.c?v.length:v.length-1;",
                    "for(var i=0;i<n;i++){var a=v[i],b=v[(i+1)%v.length];",
                    "if(a[2])p.cubicTo(a[0].x+a[2].x,a[0].y+a[2].y,b[0].x+b[1].x,b[0].y+b[1].y,b[0].x,b[0].y);",
                    "else p.lineTo(b[0].x,b[0].y);}",
                    "if(c.c)p.close();});",
                    "p"
                ].join("\n")
            });
        }

        var lookKeys = copyLook(src, out);
        api.setFrame(startFrame);

        // Move effects and downstream users across; each step records how to reverse itself
        LISTS.forEach(function (l) {
            moveList(src, out, l);
            undo.push(function () { moveList(out, src, l); });
        });
        var rewired = rewireOutputs(src, out);
        undo.push(function () {
            rewired.forEach(function (r) { api.connect(src, r.attr, r.id, r.dstAttr, true); });
        });

        // Hide the original last, so a failure above leaves it untouched
        api.set(src, { hidden: true });
        api.rename(src, name + ORIGINAL_SUFFIX);
        api.rename(out, name);
        if (pathSrc !== src) api.deleteLayer(pathSrc);

        api.select([group]);
        var count = rig.reduce(function (n, c) { return n + c.length; }, 0);
        console.log("Created " + count + " anchors" + (withHandles ? " + handles" : "") +
            " across " + contours.length + " contour(s) via the " + (native ? "native" : "JS Shape") + " route" +
            (animated ? ", with " + times.length + " path keyframes baked" : "") +
            (lookKeys ? ", " + lookKeys + " animated look attribute(s) copied" : "") +
            (rewired.length ? ", " + rewired.length + " downstream connection(s) re-pointed" : "") + ".");
        return out;
    } catch (err) {
        undo.reverse().forEach(function (fn) { try { fn(); } catch (e) {} });
        created.reverse().forEach(function (id) { try { api.deleteLayer(id); } catch (e) {} });
        api.set(src, { hidden: wasHidden });
        api.rename(src, name);
        api.setFrame(startFrame);
        console.error("Points to Nulls failed, changes rolled back: " + err.message);
    }
}

// =============================================================================
// UI
// =============================================================================
ui.setTitle("Points to Nulls");

var T = tokens();
var runButton = button("Points to Nulls", true, T);
var handlesCheckbox = new ui.Checkbox(false);

runButton.onClick = function () { pointsToNulls(handlesCheckbox.getValue()); };

var mainLayout = panel();
mainLayout.add(checkRow(handlesCheckbox, "Retain bezier handles", T));
mainLayout.add(runButton);
mainLayout.addStretch();
ui.add(mainLayout);
ui.show();
