// Lottie Importer for Cavalry
// Imports Lottie JSON shape layers (ty:4) as editable shapes with fills.
// Supports static and animated paths, layer transforms, parenting, and timing.

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

// --- Extract first path, fill, and group transform from a shape layer (ty:4) ---
function getShapePathAndFill(layer) {
    var shapes = layer.shapes;
    if (!shapes) return { pathData: null, pathKs: null, fillColor: null, groupOffset: [0, 0] };
    for (var s = 0; s < shapes.length; s++) {
        var gr = shapes[s];
        if (gr.ty !== "gr" || !gr.it) continue;
        var pathData = null;
        var pathKs = null;
        var fillColor = null;
        var groupOffset = [0, 0];
        for (var i = 0; i < gr.it.length; i++) {
            var item = gr.it[i];
            if (item.ty === "sh") {
                pathData = getPathDataFromShapeKs(item.ks);
                pathKs = item.ks;
            }
            if (item.ty === "fl" && item.c && item.c.k !== undefined) {
                var k = item.c.k;
                if (Array.isArray(k) && k.length > 0 && typeof k[0] === "object" && k[0].s) k = k[0].s;
                var r = Array.isArray(k) ? k[0] : k;
                var g = Array.isArray(k) ? k[1] : k;
                var b = Array.isArray(k) ? k[2] : k;
                if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
                    var hex = "#" + [r, g, b].map(function(x) {
                        var n = Math.round(Math.max(0, Math.min(1, x)) * 255);
                        return (n < 16 ? "0" : "") + n.toString(16);
                    }).join("");
                    fillColor = hex;
                }
            }
            if (item.ty === "tr") {
                var tp = item.p && item.p.k ? item.p.k : (item.p || [0, 0]);
                var tpx = Array.isArray(tp) ? tp[0] : (tp.x || 0);
                var tpy = Array.isArray(tp) ? tp[1] : (tp.y || 0);
                groupOffset = [tpx, tpy];
            }
        }
        if (pathData) return { pathData: pathData, pathKs: pathKs, fillColor: fillColor || "#ffffff", groupOffset: groupOffset };
    }
    return { pathData: null, pathKs: null, fillColor: "#ffffff", groupOffset: [0, 0] };
}

// --- Layer transform from Lottie ks (p, a, s, r) ---
// AE transform chain: translate(pos) * rotate(rot) * scale(s) * translate(-anchor)
// Since Cavalry has no anchor attribute, bake it into position:
//   adjustedPos = pos - anchor * (scale / 100)
function getLayerTransform(ks, yFlip, hasParent, compW, compH, scale) {
    if (!ks) return { position: [0, 0], scale: [100, 100], rotation: 0 };
    var p = ks.p && ks.p.k ? ks.p.k : (ks.p || [0, 0, 0]);
    var a = ks.a && ks.a.k ? ks.a.k : (ks.a || [0, 0, 0]);
    var s = ks.s && ks.s.k ? ks.s.k : (ks.s || [100, 100, 100]);
    var r = (ks.r && ks.r.k != null) ? ks.r.k : (ks.r || 0);
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

function createNullShape(name) {
    var p = new cavalry.Path();
    p.moveTo(0, 0);
    p.lineTo(0.001, 0);
    p.lineTo(0, 0.001);
    p.close();
    var id = api.createEditable(p, name);
    api.setFill(id, false);
    return id;
}

// Import a set of layers (from a precomp or root), returning created Cavalry IDs.
// groupId: if provided, top-level layers are parented to this group and all
// layers are treated as having a parent (no root-comp centering on positions).
function importLayerSet(layers, yFlip, scaleFactor, compW, compH, groupId) {
    var parentIndSet = {};
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].parent != null) parentIndSet[layers[i].parent] = true;
    }

    var processLayers = [];
    for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        if (l.ty === 4) {
            processLayers.push({ index: i, layer: l, isNull: false });
        } else if (l.ty === 3 && parentIndSet[l.ind]) {
            processLayers.push({ index: i, layer: l, isNull: true });
        }
    }

    var idByInd = {};
    var createdIds = [];
    var createdLayers = [];

    for (var si = processLayers.length - 1; si >= 0; si--) {
        var entry = processLayers[si];
        var layer = entry.layer;
        var name = layer.nm || "Layer " + (entry.index + 1);
        var shapeId;

        if (entry.isNull) {
            try {
                shapeId = createNullShape(name);
            } catch (e) {
                console.log("Lottie Importer: Could not create null layer '" + name + "': " + e.message);
                continue;
            }
        } else {
            var pathAndFill = getShapePathAndFill(layer);
            if (!pathAndFill.pathData) {
                console.log("Lottie Importer: Skipping layer '" + name + "' (no path data).");
                continue;
            }

            var pathKs = pathAndFill.pathKs;
            var groupOffset = pathAndFill.groupOffset;
            var isAnimated = pathKs && pathKs.a === 1 && pathKs.k && pathKs.k.length > 1;

            var path = lottiePathToCavalryPath(pathAndFill.pathData, yFlip, scaleFactor, groupOffset);
            if (!path) continue;

            try {
                shapeId = api.createEditable(path, name);
            } catch (e) {
                console.log("Lottie Importer: Could not create shape '" + name + "': " + e.message);
                continue;
            }

            api.setFill(shapeId, true);
            api.set(shapeId, { "material.materialColor": pathAndFill.fillColor, "fillRule": 1 });

            if (isAnimated && pathKs.k.length > 1) {
                var applied = 0;
                for (var kf = 0; kf < pathKs.k.length; kf++) {
                    var kfPathData = getPathDataAtKeyframe(pathKs, kf);
                    if (!kfPathData) continue;
                    var frame = getKeyframeTime(pathKs, kf);
                    var contour = lottiePathToContourData(kfPathData, yFlip, scaleFactor, groupOffset);
                    if (!contour) continue;
                    try {
                        api.keyframe(shapeId, frame, { "inputPath": contour });
                        applied++;
                    } catch (err) {
                        if (applied === 0) console.log("Lottie Importer: Path keyframes not supported for '" + name + "': " + err.message);
                        break;
                    }
                }
            }
        }

        idByInd[layer.ind] = shapeId;
        createdIds.push(shapeId);
        createdLayers.push(layer);

        if (layer.ip != null) api.setInFrame(shapeId, layer.ip);
        if (layer.op != null) api.setOutFrame(shapeId, layer.op);
    }

    // Parenting: internal layer parents
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

    // Parenting: top-level precomp layers to group
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

    // Transforms (after all parenting)
    for (var ti = 0; ti < createdLayers.length; ti++) {
        var tLayer = createdLayers[ti];
        var tId = idByInd[tLayer.ind];
        if (!tId) continue;
        var hasParent = groupId ? true : (tLayer.parent != null);
        var transform = getLayerTransform(tLayer.ks, yFlip, hasParent, compW, compH, scaleFactor);
        api.set(tId, {
            "position": transform.position,
            "rotation": transform.rotation,
            "scale.x": transform.scale[0] / 100,
            "scale.y": transform.scale[1] / 100
        });
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
    var precompRefs = [];
    for (var i = 0; i < rootLayers.length; i++) {
        if (rootLayers[i].ty === 0) precompRefs.push(rootLayers[i]);
    }

    var allCreatedIds = [];

    if (precompRefs.length > 0) {
        for (var pi = precompRefs.length - 1; pi >= 0; pi--) {
            var ref = precompRefs[pi];
            var assetId = ref.refId || ref.ref;
            var asset = null;
            for (var ai = 0; ai < assets.length; ai++) {
                if (assets[ai].id === assetId) { asset = assets[ai]; break; }
            }
            if (!asset || !asset.layers) continue;

            var groupId;
            try {
                groupId = createNullShape(ref.nm || "Precomp " + pi);
            } catch (e) { continue; }
            allCreatedIds.push(groupId);

            var groupTransform = getLayerTransform(ref.ks, yFlip, false, compInfo.w, compInfo.h, scaleFactor);
            api.set(groupId, {
                "position": groupTransform.position,
                "rotation": groupTransform.rotation,
                "scale.x": groupTransform.scale[0] / 100,
                "scale.y": groupTransform.scale[1] / 100
            });

            var ids = importLayerSet(asset.layers, yFlip, scaleFactor, compInfo.w, compInfo.h, groupId);
            allCreatedIds = allCreatedIds.concat(ids);
        }
    } else {
        var flatLayers = rootLayers;
        if (flatLayers.length === 0 && assets.length > 0 && assets[0].layers) {
            flatLayers = assets[0].layers;
        }
        var ids = importLayerSet(flatLayers, yFlip, scaleFactor, compInfo.w, compInfo.h, null);
        allCreatedIds = allCreatedIds.concat(ids);
    }

    if (allCreatedIds.length === 0) throw new Error("No shape layers found in this Lottie.");
    api.select(allCreatedIds);
    return allCreatedIds.length;
}
