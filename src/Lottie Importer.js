// Lottie Importer for Cavalry
// Imports Lottie JSON shape layers (ty:4) as editable shapes with fills.
// Supports static and animated paths, layer transforms, parenting, timing,
// multiple shapes per layer, pathless parent groups, animated transforms,
// masks (including animated mask paths), and recursive nested precomps.

ui.setTitle("Lottie Importer");

var statusLabel = new ui.Label("Choose a Lottie JSON file to import.");
var importButton = new ui.Button("Import Lottie…");

importButton.onClick = function() {
    var startPath = api.getProjectPath() || api.getDesktopFolder();
    var filePath = api.presentOpenFile(
        startPath,
        "Import Lottie JSON",
        "JSON File (*.json)"
    );

    if (!filePath || filePath === "") {
        statusLabel.setText("Import cancelled.");
        return;
    }

    var jsonString;
    try {
        jsonString = api.readFromFile(filePath);
    } catch (e) {
        statusLabel.setText("Failed to read file: " + e.message);
        return;
    }

    if (!jsonString) {
        statusLabel.setText("Failed to read file.");
        return;
    }

    var lottie;
    try {
        lottie = JSON.parse(jsonString);
    } catch (e) {
        statusLabel.setText("Invalid JSON: " + e.message);
        return;
    }

    statusLabel.setText("Importing…");
    try {
        var count = importLottie(lottie);
        statusLabel.setText("Imported " + count + " shape layer(s).");
    } catch (e) {
        console.log("Lottie import error: " + e.message);
        statusLabel.setText("Error: " + e.message);
    }
};

ui.add(statusLabel);
ui.addSpacing(10);
ui.add(importButton);
ui.show();

// --- Lottie parsing and layer source ---

function getCompInfo(lottie) {
    return {
        w: lottie.w || 1920,
        h: lottie.h || 1080,
        fr: lottie.fr || 60,
        ip: lottie.ip != null ? lottie.ip : 0,
        op: lottie.op != null ? lottie.op : 60
    };
}

// --- Path conversion: Lottie vertex + in/out tangents -> cavalry.Path ---
// Lottie: v = vertices, i = in tangents, o = out tangents, c = closed.
// cp1 = v[i] + o[i], cp2 = v[i+1] + i[i+1], end = v[i+1].
// yFlip: negate Y so Lottie (often Y-down) matches Cavalry.

function lottiePathToCavalryPath(pathData, yFlip, scale, groupOffset) {
    if (!pathData || !pathData.v || pathData.v.length === 0) return null;
    var v = pathData.v;
    var i = pathData.i || [];
    var o = pathData.o || [];
    var c = pathData.c === true;
    var mul = yFlip ? -1 : 1;
    var sc = scale || 1;
    var gx = groupOffset ? groupOffset[0] : 0;
    var gy = groupOffset ? groupOffset[1] : 0;

    var path = new cavalry.Path();
    path.moveTo(sc * (v[0][0] + gx), sc * mul * (v[0][1] + gy));

    for (var idx = 0; idx < v.length; idx++) {
        var next = (idx + 1) % v.length;
        var v0 = v[idx];
        var v1 = v[next];
        var o0 = o[idx] || [0, 0];
        var i1 = i[next] || [0, 0];
        var cp1x = sc * (v0[0] + gx + o0[0]);
        var cp1y = sc * mul * (v0[1] + gy + o0[1]);
        var cp2x = sc * (v1[0] + gx + i1[0]);
        var cp2y = sc * mul * (v1[1] + gy + i1[1]);
        var endX = sc * (v1[0] + gx);
        var endY = sc * mul * (v1[1] + gy);
        path.cubicTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    }
    if (c && v.length > 1) path.close();
    return path;
}

// Build Cavalry's internal contour format from Lottie path data.
// This is the native editablePath2 structure that Cavalry stores internally,
// needed because cavalry.Path objects don't serialize through api.keyframe().
function lottiePathToContourData(pathData, yFlip, scale, groupOffset) {
    if (!pathData || !pathData.v || pathData.v.length === 0) return null;
    var v = pathData.v;
    var inT = pathData.i || [];
    var outT = pathData.o || [];
    var c = pathData.c === true;
    var mul = yFlip ? -1 : 1;
    var sc = scale || 1;
    var gx = groupOffset ? groupOffset[0] : 0;
    var gy = groupOffset ? groupOffset[1] : 0;

    var points = [];
    for (var idx = 0; idx < v.length; idx++) {
        var vx = sc * (v[idx][0] + gx);
        var vy = sc * mul * (v[idx][1] + gy);
        var iRel = inT[idx] || [0, 0];
        var oRel = outT[idx] || [0, 0];
        var inAbsX = sc * (v[idx][0] + gx + iRel[0]);
        var inAbsY = sc * mul * (v[idx][1] + gy + iRel[1]);
        var outAbsX = sc * (v[idx][0] + gx + oRel[0]);
        var outAbsY = sc * mul * (v[idx][1] + gy + oRel[1]);
        points.push({
            gradientLocked: idx > 0,
            points: [
                { x: inAbsX, y: inAbsY },
                { x: outAbsX, y: outAbsY },
                { x: vx, y: vy }
            ],
            weightLocked: false
        });
    }

    return {
        contours: [{ closed: c, points: points }],
        fillType: 0,
        version: 1
    };
}

function getPathDataFromShapeKs(ks) {
    if (!ks) return null;
    if (ks.a === 0 && ks.k) return ks.k;
    if (ks.a === 1 && ks.k && ks.k.length > 0 && ks.k[0].s && ks.k[0].s[0]) return ks.k[0].s[0];
    return null;
}

function getPathDataAtKeyframe(ks, keyframeIndex) {
    if (!ks || ks.a !== 1 || !ks.k || !ks.k[keyframeIndex]) return null;
    var s = ks.k[keyframeIndex].s;
    if (s && s[0]) return s[0];
    return null;
}

function getKeyframeTime(ks, keyframeIndex) {
    if (!ks || !ks.k || !ks.k[keyframeIndex]) return 0;
    return ks.k[keyframeIndex].t != null ? ks.k[keyframeIndex].t : 0;
}

// --- Extract static value from Lottie transform property (handles animated) ---
function getStaticValue(prop, fallback) {
    if (!prop) return fallback;
    if (prop.a === 1 && prop.k && prop.k.length > 0 && prop.k[0].s !== undefined) {
        return prop.k[0].s;
    }
    if (prop.k !== undefined) return prop.k;
    return fallback;
}

// --- Split position: Lottie stores X and Y separately when ks.p.s === true ---
function getSplitPosition(ks) {
    if (!ks || !ks.p || ks.p.s !== true) return null;
    var px = ks.p.x ? getStaticValue(ks.p.x, 0) : 0;
    var py = ks.p.y ? getStaticValue(ks.p.y, 0) : 0;
    if (Array.isArray(px)) px = px[0];
    if (Array.isArray(py)) py = py[0];
    return [px, py, 0];
}

// --- Extract fill color from Lottie fill item ---
function extractFillColor(flItem) {
    if (!flItem || flItem.ty !== "fl" || !flItem.c || flItem.c.k === undefined) return "#ffffff";
    var k = flItem.c.k;
    if (Array.isArray(k) && k.length > 0 && typeof k[0] === "object" && k[0].s) k = k[0].s;
    var r = Array.isArray(k) ? k[0] : k;
    var g = Array.isArray(k) ? k[1] : k;
    var b = Array.isArray(k) ? k[2] : k;
    if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
        return "#" + [r, g, b].map(function(x) {
            var n = Math.round(Math.max(0, Math.min(1, x)) * 255);
            return (n < 16 ? "0" : "") + n.toString(16);
        }).join("");
    }
    return "#ffffff";
}

// --- Extract all shape groups from a shape layer (ty:4) ---
function getAllShapesFromLayer(layer) {
    var shapes = layer.shapes;
    if (!shapes) return [];
    var result = [];
    for (var s = 0; s < shapes.length; s++) {
        var gr = shapes[s];
        if (gr.ty !== "gr" || !gr.it) continue;
        var pathData = null;
        var pathKs = null;
        var fillColor = "#ffffff";
        var groupOffset = [0, 0];
        for (var i = 0; i < gr.it.length; i++) {
            var item = gr.it[i];
            if (item.ty === "sh") {
                pathData = getPathDataFromShapeKs(item.ks);
                pathKs = item.ks;
            }
            if (item.ty === "fl") fillColor = extractFillColor(item);
            if (item.ty === "tr") {
                var tp = item.p && item.p.k ? item.p.k : (item.p || [0, 0]);
                var tpx = Array.isArray(tp) ? tp[0] : (tp.x || 0);
                var tpy = Array.isArray(tp) ? tp[1] : (tp.y || 0);
                groupOffset = [tpx, tpy];
            }
        }
        if (pathData) {
            result.push({ pathData: pathData, pathKs: pathKs, fillColor: fillColor, groupOffset: groupOffset });
        }
    }
    return result;
}

// --- Layer transform from Lottie ks (p, a, s, r) ---
// AE transform chain: translate(pos) * rotate(rot) * scale(s) * translate(-anchor)
// Since Cavalry has no anchor attribute, bake it into position:
//   adjustedPos = pos - anchor * (scale / 100)
function getLayerTransform(ks, yFlip, hasParent, compW, compH, scale) {
    if (!ks) return { position: [0, 0], scale: [100, 100], rotation: 0 };
    var p = getSplitPosition(ks);
    if (!p) p = getStaticValue(ks.p, [0, 0, 0]);
    if (!Array.isArray(p)) p = [0, 0, 0];
    var a = getStaticValue(ks.a, [0, 0, 0]);
    if (!Array.isArray(a)) a = [0, 0, 0];
    var s = getStaticValue(ks.s, [100, 100, 100]);
    var rVal = getStaticValue(ks.r, 0);
    var r = Array.isArray(rVal) ? rVal[0] : rVal;
    var sc = scale || 1;

    var sx = (Array.isArray(s) ? s[0] : s) / 100;
    var sy = (Array.isArray(s) ? s[1] : s) / 100;

    var px = p[0] - a[0] * sx;
    var py = p[1] - a[1] * sy;

    if (!hasParent) {
        px -= compW / 2;
        py -= compH / 2;
    }
    var cavX = sc * px;
    var cavY = sc * (yFlip ? -py : py);
    var cavR = yFlip ? -r : r;

    return {
        position: [cavX, cavY],
        scale: [Array.isArray(s) ? s[0] : s, Array.isArray(s) ? s[1] : s],
        rotation: cavR
    };
}

function createGroup(name) {
    return api.create("group", name);
}

// --- Apply Lottie bezier easing to Cavalry keyframe tangents ---
// cavalryKfs: array of {frame, value} pairs matching the created keyframes
// lottieKfs: the raw Lottie keyframe array (with i/o tangent data)
// component: index into Lottie's per-component tangent arrays (0 for x, 1 for y)
//
// Cavalry API (from Convert Frame Rate):
//   api.modifyKeyframeTangent(nodeId, { attrName: {
//     frame, inHandle, outHandle, xValue, yValue, angleLocked, weightLocked
//   }})
// xValue/yValue are ABSOLUTE positions (frame + offset, value + offset).
//
// Lottie stores normalized cubic-bezier per segment:
//   kf[n].o = outgoing P1 {x:[...], y:[...]}
//   kf[n].i = incoming P2 {x:[...], y:[...]}
function applyLottieEasing(nodeId, attr, cavalryKfs, lottieKfs, component) {
    if (!cavalryKfs || cavalryKfs.length < 2 || !lottieKfs) return;
    var ci = (component != null) ? component : 0;
    for (var i = 0; i < cavalryKfs.length - 1; i++) {
        var lkf = lottieKfs[i];
        if (!lkf || !lkf.o) continue;
        var curFrame = cavalryKfs[i].frame;
        var curValue = cavalryKfs[i].value;
        var nxtFrame = cavalryKfs[i + 1].frame;
        var nxtValue = cavalryKfs[i + 1].value;
        var frameDiff = nxtFrame - curFrame;
        var valueDiff = nxtValue - curValue;

        var x1 = Array.isArray(lkf.o.x) ? lkf.o.x[ci] : (lkf.o.x || 0);
        var y1 = Array.isArray(lkf.o.y) ? lkf.o.y[ci] : (lkf.o.y || 0);
        var outHX = x1 * frameDiff;
        var outHY = y1 * valueDiff;
        try {
            var t1 = {};
            t1[attr] = {
                "frame": curFrame, "inHandle": false, "outHandle": true,
                "xValue": curFrame + outHX, "yValue": curValue + outHY,
                "angleLocked": false, "weightLocked": false
            };
            api.modifyKeyframeTangent(nodeId, t1);
        } catch (e) {}

        if (lkf.i) {
            var x2 = Array.isArray(lkf.i.x) ? lkf.i.x[ci] : (lkf.i.x || 1);
            var y2 = Array.isArray(lkf.i.y) ? lkf.i.y[ci] : (lkf.i.y || 1);
            var inHX = (x2 - 1) * frameDiff;
            var inHY = (y2 - 1) * valueDiff;
            try {
                var t2 = {};
                t2[attr] = {
                    "frame": nxtFrame, "inHandle": true, "outHandle": false,
                    "xValue": nxtFrame + inHX, "yValue": nxtValue + inHY,
                    "angleLocked": false, "weightLocked": false
                };
                api.modifyKeyframeTangent(nodeId, t2);
            } catch (e) {}
        }
    }
}

// --- Keyframe animated transforms (p, s, r) ---
function keyframeAnimatedTransforms(nodeId, ks, yFlip, hasParent, compW, compH, scaleFactor, timeOffset) {
    if (!ks) return;
    var tOff = timeOffset || 0;
    var sc = scaleFactor || 1;
    var a = getStaticValue(ks.a, [0, 0, 0]);
    var ax = Array.isArray(a) ? a[0] : 0;
    var ay = Array.isArray(a) ? a[1] : 0;
    var s = getStaticValue(ks.s, [100, 100, 100]);
    var sx = (Array.isArray(s) ? s[0] : s) / 100;
    var sy = (Array.isArray(s) ? s[1] : s) / 100;
    var centX = hasParent ? 0 : compW / 2;
    var centY = hasParent ? 0 : compH / 2;

    if (ks.p && ks.p.s === true) {
        var pxProp = ks.p.x;
        var pyProp = ks.p.y;
        if (pxProp && pxProp.a === 1 && pxProp.k) {
            var pxKfs = [];
            for (var kpi = 0; kpi < pxProp.k.length; kpi++) {
                var kpx = pxProp.k[kpi];
                var frame = (kpx.t != null ? kpx.t : 0) + tOff;
                var vx = Array.isArray(kpx.s) ? kpx.s[0] : kpx.s;
                if (vx == null) continue;
                var px = sc * (vx - ax * sx - centX);
                try {
                    api.keyframe(nodeId, frame, { "position.x": px });
                    pxKfs.push({ frame: frame, value: px });
                } catch (e) {}
            }
            applyLottieEasing(nodeId, "position.x", pxKfs, pxProp.k, 0);
        }
        if (pyProp && pyProp.a === 1 && pyProp.k) {
            var pyKfs = [];
            for (var kpi2 = 0; kpi2 < pyProp.k.length; kpi2++) {
                var kpy = pyProp.k[kpi2];
                var frame = (kpy.t != null ? kpy.t : 0) + tOff;
                var vy = Array.isArray(kpy.s) ? kpy.s[0] : kpy.s;
                if (vy == null) continue;
                var py = sc * (yFlip ? -(vy - ay * sy - centY) : (vy - ay * sy - centY));
                try {
                    api.keyframe(nodeId, frame, { "position.y": py });
                    pyKfs.push({ frame: frame, value: py });
                } catch (e) {}
            }
            applyLottieEasing(nodeId, "position.y", pyKfs, pyProp.k, 0);
        }
    } else if (ks.p && ks.p.a === 1 && ks.p.k && ks.p.k.length > 1) {
        var posXKfs = [];
        var posYKfs = [];
        for (var kp = 0; kp < ks.p.k.length; kp++) {
            var kpv = ks.p.k[kp];
            var frame = (kpv.t != null ? kpv.t : 0) + tOff;
            var v = kpv.s || kpv.k;
            if (!Array.isArray(v)) continue;
            var px = sc * (v[0] - ax * sx - centX);
            var py = sc * (yFlip ? -(v[1] - ay * sy - centY) : (v[1] - ay * sy - centY));
            try {
                api.keyframe(nodeId, frame, { "position.x": px, "position.y": py });
                posXKfs.push({ frame: frame, value: px });
                posYKfs.push({ frame: frame, value: py });
            } catch (e) {}
        }
        applyLottieEasing(nodeId, "position.x", posXKfs, ks.p.k, 0);
        applyLottieEasing(nodeId, "position.y", posYKfs, ks.p.k, 1);
    }

    if (ks.s && ks.s.a === 1 && ks.s.k && ks.s.k.length > 1) {
        var scaleXKfs = [];
        var scaleYKfs = [];
        for (var ks2 = 0; ks2 < ks.s.k.length; ks2++) {
            var ksv = ks.s.k[ks2];
            var frame = (ksv.t != null ? ksv.t : 0) + tOff;
            var v = ksv.s || ksv.k;
            var sxVal = (Array.isArray(v) ? v[0] : v) / 100;
            var syVal = (Array.isArray(v) ? v[1] : v) / 100;
            try {
                api.keyframe(nodeId, frame, { "scale.x": sxVal, "scale.y": syVal });
                scaleXKfs.push({ frame: frame, value: sxVal });
                scaleYKfs.push({ frame: frame, value: syVal });
            } catch (e) {}
        }
        applyLottieEasing(nodeId, "scale.x", scaleXKfs, ks.s.k, 0);
        applyLottieEasing(nodeId, "scale.y", scaleYKfs, ks.s.k, 1);
    }

    if (ks.r && ks.r.a === 1 && ks.r.k && ks.r.k.length > 1) {
        var rotKfs = [];
        for (var kr = 0; kr < ks.r.k.length; kr++) {
            var krv = ks.r.k[kr];
            var frame = (krv.t != null ? krv.t : 0) + tOff;
            var rVal = krv.s !== undefined ? krv.s : krv.k;
            var r = Array.isArray(rVal) ? rVal[0] : rVal;
            var cavR = yFlip ? -r : r;
            try {
                api.keyframe(nodeId, frame, { "rotation.z": cavR });
                rotKfs.push({ frame: frame, value: cavR });
            } catch (e) {}
        }
        applyLottieEasing(nodeId, "rotation.z", rotKfs, ks.r.k, 0);
    }
}

// --- Animate shape path keyframes ---
function animateShapePath(shapeId, pathKs, yFlip, scaleFactor, groupOffset, timeOffset) {
    if (!pathKs || pathKs.a !== 1 || !pathKs.k || pathKs.k.length <= 1) return;
    var tOff = timeOffset || 0;
    var applied = 0;
    for (var kf = 0; kf < pathKs.k.length; kf++) {
        var kfPathData = getPathDataAtKeyframe(pathKs, kf);
        if (!kfPathData) continue;
        var frame = getKeyframeTime(pathKs, kf) + tOff;
        var contour = lottiePathToContourData(kfPathData, yFlip, scaleFactor, groupOffset);
        if (!contour) continue;
        try {
            api.keyframe(shapeId, frame, { "inputPath": contour });
            applied++;
        } catch (err) {
            if (applied === 0) console.log("Lottie Importer: Path keyframes not supported: " + err.message);
            break;
        }
    }
}

// --- Apply Lottie masks as Cavalry clipping masks ---
function applyMasks(layer, targetIds, yFlip, scaleFactor, nodeId, timeOffset) {
    var masks = layer.masksProperties;
    if (!masks || !targetIds || targetIds.length === 0) return;
    var tOff = timeOffset || 0;
    for (var m = 0; m < masks.length; m++) {
        var mask = masks[m];
        if (mask.mode !== "a" && mask.mode !== "n") continue;
        var pt = mask.pt;
        if (!pt) continue;
        var pathData = getPathDataFromShapeKs(pt);
        if (!pathData) continue;
        var path = lottiePathToCavalryPath(pathData, yFlip, scaleFactor, [0, 0]);
        if (!path) continue;
        var maskId;
        try {
            maskId = api.createEditable(path, "Mask " + m);
        } catch (e) { continue; }
        api.set(maskId, { "hidden": true });
        if (pt.a === 1 && pt.k && pt.k.length > 1) {
            for (var kf = 0; kf < pt.k.length; kf++) {
                var kfData = getPathDataAtKeyframe(pt, kf);
                if (!kfData) continue;
                var frame = getKeyframeTime(pt, kf) + tOff;
                var contour = lottiePathToContourData(kfData, yFlip, scaleFactor, [0, 0]);
                if (!contour) continue;
                try { api.keyframe(maskId, frame, { "inputPath": contour }); } catch (e) {}
            }
        }
        for (var t = 0; t < targetIds.length; t++) {
            try {
                api.connect(maskId, "id", targetIds[t], "masks." + m + ".id");
            } catch (e) {
                console.log("Lottie Importer: Mask connect failed (slot " + m + "): " + e.message);
                try { api.connect(maskId, "id", targetIds[t], "masks.0.id"); }
                catch (e2) { console.log("Lottie Importer: Mask connect fallback failed: " + e2.message); }
            }
        }
    }
}

// Import a set of layers (from a precomp or root), returning created Cavalry IDs.
// groupId: if provided, top-level layers are parented to this group and all
// layers are treated as having a parent (no root-comp centering on positions).
// timeOffset: accumulated precomp st offset for keyframe times.
function importLayerSet(layers, assets, yFlip, scaleFactor, compW, compH, groupId, timeOffset) {
    var tOff = timeOffset || 0;
    var parentIndSet = {};
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].parent != null) parentIndSet[layers[i].parent] = true;
    }

    var processLayers = [];
    for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        if (l.ty === 0) {
            processLayers.push({ index: i, layer: l, kind: "precomp" });
        } else if (l.ty === 4) {
            var shapes = getAllShapesFromLayer(l);
            if (shapes.length > 0) {
                processLayers.push({ index: i, layer: l, kind: "shape", shapes: shapes });
            } else if (parentIndSet[l.ind]) {
                processLayers.push({ index: i, layer: l, kind: "null" });
            }
        } else if (l.ty === 3 && parentIndSet[l.ind]) {
            processLayers.push({ index: i, layer: l, kind: "null" });
        }
    }

    var idByInd = {};
    var createdIds = [];
    var createdLayers = [];

    // Pass 1: Create all nodes (backward iteration — Cavalry prepends new nodes)
    for (var si = processLayers.length - 1; si >= 0; si--) {
        var entry = processLayers[si];
        var layer = entry.layer;
        var name = layer.nm || "Layer " + (entry.index + 1);
        var nodeId;

        if (entry.kind === "precomp") {
            var assetId = layer.refId || layer.ref;
            var asset = null;
            for (var ai = 0; ai < (assets || []).length; ai++) {
                if (assets[ai].id === assetId) { asset = assets[ai]; break; }
            }
            if (!asset || !asset.layers) continue;
            try {
                nodeId = createGroup(name);
            } catch (e) {
                console.log("Lottie Importer: Could not create precomp group '" + name + "': " + e.message);
                continue;
            }
            var childSt = layer.st != null ? layer.st : 0;
            var childIds = importLayerSet(asset.layers, assets, yFlip, scaleFactor, compW, compH, nodeId, tOff + childSt);
            createdIds = createdIds.concat(childIds);
        } else if (entry.kind === "null") {
            try {
                nodeId = createGroup(name);
            } catch (e) {
                console.log("Lottie Importer: Could not create null layer '" + name + "': " + e.message);
                continue;
            }
        } else if (entry.kind === "shape") {
            var shapeList = entry.shapes;
            var targetIds = [];
            if (shapeList.length === 1) {
                var s0 = shapeList[0];
                var path = lottiePathToCavalryPath(s0.pathData, yFlip, scaleFactor, s0.groupOffset);
                if (!path) continue;
                try {
                    nodeId = api.createEditable(path, name);
                } catch (e) {
                    console.log("Lottie Importer: Could not create shape '" + name + "': " + e.message);
                    continue;
                }
                api.setFill(nodeId, true);
                api.set(nodeId, { "material.materialColor": s0.fillColor, "fillRule": 1 });
                animateShapePath(nodeId, s0.pathKs, yFlip, scaleFactor, s0.groupOffset, tOff);
                targetIds = [nodeId];
            } else {
                try {
                    nodeId = createGroup(name);
                } catch (e) {
                    console.log("Lottie Importer: Could not create group '" + name + "': " + e.message);
                    continue;
                }
                for (var ss = 0; ss < shapeList.length; ss++) {
                    var s = shapeList[ss];
                    var sp = lottiePathToCavalryPath(s.pathData, yFlip, scaleFactor, s.groupOffset);
                    if (!sp) continue;
                    var subId;
                    try {
                        subId = api.createEditable(sp, name + " " + (ss + 1));
                    } catch (e) { continue; }
                    api.setFill(subId, true);
                    api.set(subId, { "material.materialColor": s.fillColor, "fillRule": 1 });
                    animateShapePath(subId, s.pathKs, yFlip, scaleFactor, s.groupOffset, tOff);
                    try { api.parent(subId, nodeId); } catch (e) {}
                    targetIds.push(subId);
                }
            }
            applyMasks(layer, targetIds, yFlip, scaleFactor, nodeId, tOff);
        } else {
            continue;
        }

        idByInd[layer.ind] = nodeId;
        createdIds.push(nodeId);
        createdLayers.push(entry);

        if (layer.ip != null) api.setInFrame(nodeId, layer.ip + tOff);
        if (layer.op != null) api.setOutFrame(nodeId, layer.op + tOff);
    }

    // Pass 2: Parenting
    for (var j = 0; j < layers.length; j++) {
        var l = layers[j];
        if (l.parent == null) continue;
        var childId = idByInd[l.ind];
        var parentId = idByInd[l.parent];
        if (childId && parentId && childId !== parentId) {
            try { api.parent(childId, parentId); }
            catch (e) { console.log("Lottie Importer: Could not parent '" + (l.nm || l.ind) + "': " + e.message); }
        }
    }
    if (groupId) {
        for (var k = 0; k < layers.length; k++) {
            if (layers[k].parent != null) continue;
            var topId = idByInd[layers[k].ind];
            if (topId) {
                try { api.parent(topId, groupId); }
                catch (e) {}
            }
        }
    }

    // Pass 3: Transforms
    for (var ti = 0; ti < createdLayers.length; ti++) {
        var entry = createdLayers[ti];
        var tLayer = entry.layer;
        var tId = idByInd[tLayer.ind];
        if (!tId) continue;
        var hasParent = groupId ? true : (tLayer.parent != null);
        var transform = getLayerTransform(tLayer.ks, yFlip, hasParent, compW, compH, scaleFactor);
        api.set(tId, {
            "position": transform.position,
            "rotation.z": transform.rotation,
            "scale.x": transform.scale[0] / 100,
            "scale.y": transform.scale[1] / 100
        });
        keyframeAnimatedTransforms(tId, tLayer.ks, yFlip, hasParent, compW, compH, scaleFactor, tOff);
    }

    return createdIds;
}

function importLottie(lottie) {
    var compInfo = getCompInfo(lottie);
    var yFlip = true;

    var cavCompW = 1920;
    var cavCompH = 1080;
    var activeComp = api.getActiveComp();
    if (activeComp) {
        try {
            if (api.hasAttribute(activeComp, "width")) cavCompW = api.get(activeComp, "width");
            if (api.hasAttribute(activeComp, "height")) cavCompH = api.get(activeComp, "height");
        } catch (e) {}
        try {
            if (api.hasAttribute(activeComp, "fps")) api.set(activeComp, { "fps": compInfo.fr });
            if (api.hasAttribute(activeComp, "startFrame")) api.set(activeComp, { "startFrame": compInfo.ip });
            if (api.hasAttribute(activeComp, "endFrame")) api.set(activeComp, { "endFrame": compInfo.op });
        } catch (e) {}
    }

    var scaleFactor = Math.min(cavCompW / compInfo.w, cavCompH / compInfo.h);
    console.log("Lottie Importer: " + compInfo.w + "x" + compInfo.h + " @ " + compInfo.fr + "fps -> fit to " + cavCompW + "x" + cavCompH + " (scale " + scaleFactor.toFixed(4) + ")");

    var rootLayers = lottie.layers || [];
    var assets = lottie.assets || [];
    if (rootLayers.length === 0 && assets.length > 0 && assets[0].layers) {
        rootLayers = assets[0].layers;
    }

    var allCreatedIds = importLayerSet(rootLayers, assets, yFlip, scaleFactor, compInfo.w, compInfo.h, null, 0);

    if (allCreatedIds.length === 0) throw new Error("No shape layers found in this Lottie.");
    api.select(allCreatedIds);
    return allCreatedIds.length;
}
