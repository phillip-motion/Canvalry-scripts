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

    var segCount = c ? v.length : v.length - 1;
    for (var idx = 0; idx < segCount; idx++) {
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

// Append a Lottie sub-path to an existing cavalry.Path (for compound/multi-contour shapes).
function appendLottiePathToCavalryPath(path, pathData, yFlip, scale, groupOffset) {
    if (!pathData || !pathData.v || pathData.v.length === 0) return;
    var v = pathData.v;
    var i = pathData.i || [];
    var o = pathData.o || [];
    var c = pathData.c === true;
    var mul = yFlip ? -1 : 1;
    var sc = scale || 1;
    var gx = groupOffset ? groupOffset[0] : 0;
    var gy = groupOffset ? groupOffset[1] : 0;

    path.moveTo(sc * (v[0][0] + gx), sc * mul * (v[0][1] + gy));
    var segCount = c ? v.length : v.length - 1;
    for (var idx = 0; idx < segCount; idx++) {
        var next = (idx + 1) % v.length;
        var v0 = v[idx];
        var v1 = v[next];
        var o0 = o[idx] || [0, 0];
        var i1 = i[next] || [0, 0];
        path.cubicTo(
            sc * (v0[0] + gx + o0[0]), sc * mul * (v0[1] + gy + o0[1]),
            sc * (v1[0] + gx + i1[0]), sc * mul * (v1[1] + gy + i1[1]),
            sc * (v1[0] + gx),         sc * mul * (v1[1] + gy));
    }
    if (c && v.length > 1) path.close();
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

// --- Extract gradient fill info from Lottie gf item ---
function extractGradientInfo(gfItem) {
    if (!gfItem || gfItem.ty !== "gf") return null;
    var type = gfItem.t || 1;
    var startPt = getStaticValue(gfItem.s, [0, 0]);
    var endPt = getStaticValue(gfItem.e, [0, 0]);
    if (!Array.isArray(startPt)) startPt = [0, 0];
    if (!Array.isArray(endPt)) endPt = [0, 0];
    var numStops = (gfItem.g && gfItem.g.p) || 0;
    var rawK = gfItem.g && gfItem.g.k;
    var kArr = rawK ? getStaticValue(rawK, []) : [];
    if (!Array.isArray(kArr)) kArr = [];

    var stops = [];
    for (var si = 0; si < numStops; si++) {
        var base = si * 4;
        if (base + 3 >= kArr.length) break;
        var pos = kArr[base];
        var r = kArr[base + 1];
        var g = kArr[base + 2];
        var b = kArr[base + 3];
        var hex = "#" + [r, g, b].map(function(x) {
            var n = Math.round(Math.max(0, Math.min(1, x)) * 255);
            return (n < 16 ? "0" : "") + n.toString(16);
        }).join("");
        stops.push({ position: pos, color: hex });
    }
    if (stops.length < 2) return null;

    return { type: type, startPt: startPt, endPt: endPt, stops: stops };
}

function applyGradientFill(shapeId, gradInfo, scaleFactor) {
    if (!gradInfo || !gradInfo.stops || gradInfo.stops.length < 2) return;
    try {
        var gradientId = api.create("gradientShader", "Gradient");
        var genType = gradInfo.type === 2 ? "radialGradientShader" : "linearGradientShader";
        try {
            api.set(gradientId, { "generator": genType });
        } catch (e) {
            api.set(gradientId, { "generator": "linearGradientShader" });
        }

        var colors = [];
        for (var ci = 0; ci < gradInfo.stops.length; ci++) colors.push(gradInfo.stops[ci].color);
        api.setGradientFromColors(gradientId, "generator.gradient", colors);

        for (var pi = 0; pi < gradInfo.stops.length; pi++) {
            var posObj = {};
            posObj["generator.gradient." + pi + ".position"] = gradInfo.stops[pi].position;
            api.set(gradientId, posObj);
        }

        if (gradInfo.type !== 2) {
            var dx = gradInfo.endPt[0] - gradInfo.startPt[0];
            var dy = gradInfo.endPt[1] - gradInfo.startPt[1];
            var angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
            api.set(gradientId, { "generator.rotation": angleDeg - 180 });
        }

        api.connect(gradientId, "id", shapeId, "material", true);
    } catch (e) {
        console.log("Lottie Importer: Could not apply gradient: " + e.message);
    }
}

// --- Extract stroke info from Lottie stroke item ---
function extractStrokeInfo(stItem) {
    if (!stItem || stItem.ty !== "st") return null;
    var color = "#000000";
    if (stItem.c && stItem.c.k !== undefined) {
        var k = stItem.c.k;
        if (Array.isArray(k) && k.length > 0 && typeof k[0] === "object" && k[0].s) k = k[0].s;
        var r = Array.isArray(k) ? k[0] : k;
        var g = Array.isArray(k) ? k[1] : k;
        var b = Array.isArray(k) ? k[2] : k;
        if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
            color = "#" + [r, g, b].map(function(x) {
                var n = Math.round(Math.max(0, Math.min(1, x)) * 255);
                return (n < 16 ? "0" : "") + n.toString(16);
            }).join("");
        }
    }
    var w = 2;
    if (stItem.w) {
        var wVal = getStaticValue(stItem.w, 2);
        w = Array.isArray(wVal) ? wVal[0] : wVal;
    }
    return { color: color, width: w };
}

// --- Convert Lottie ellipse (ty:el) to path data ---
function ellipseToPathData(elItem) {
    var sizeVal = getStaticValue(elItem.s, [100, 100]);
    var posVal = getStaticValue(elItem.p, [0, 0]);
    var rx = (Array.isArray(sizeVal) ? sizeVal[0] : sizeVal) / 2;
    var ry = (Array.isArray(sizeVal) ? sizeVal[1] : sizeVal) / 2;
    var cx = Array.isArray(posVal) ? posVal[0] : 0;
    var cy = Array.isArray(posVal) ? posVal[1] : 0;
    var kx = rx * 0.5522847498;
    var ky = ry * 0.5522847498;
    return {
        v: [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]],
        o: [[kx, 0], [0, ky], [-kx, 0], [0, -ky]],
        i: [[-kx, 0], [0, -ky], [kx, 0], [0, ky]],
        c: true
    };
}

// --- Convert Lottie rectangle (ty:rc) to path data ---
function rectToPathData(rcItem) {
    var sizeVal = getStaticValue(rcItem.s, [100, 100]);
    var posVal = getStaticValue(rcItem.p, [0, 0]);
    var rndVal = getStaticValue(rcItem.r, 0);
    if (Array.isArray(rndVal)) rndVal = rndVal[0];
    var hw = (Array.isArray(sizeVal) ? sizeVal[0] : sizeVal) / 2;
    var hh = (Array.isArray(sizeVal) ? sizeVal[1] : sizeVal) / 2;
    var cx = Array.isArray(posVal) ? posVal[0] : 0;
    var cy = Array.isArray(posVal) ? posVal[1] : 0;
    var r = Math.min(Math.abs(rndVal) || 0, Math.min(hw, hh));
    var k = r * 0.5522847498;
    if (r > 0.001) {
        return {
            v: [
                [cx + hw, cy - hh + r], [cx + hw - r, cy - hh],
                [cx - hw + r, cy - hh], [cx - hw, cy - hh + r],
                [cx - hw, cy + hh - r], [cx - hw + r, cy + hh],
                [cx + hw - r, cy + hh], [cx + hw, cy + hh - r]
            ],
            o: [
                [0, -k], [0, 0], [-k, 0], [0, 0], [0, k], [0, 0], [k, 0], [0, 0]
            ],
            i: [
                [0, 0], [k, 0], [0, 0], [0, -k], [0, 0], [-k, 0], [0, 0], [0, k]
            ],
            c: true
        };
    }
    return {
        v: [[cx + hw, cy - hh], [cx - hw, cy - hh], [cx - hw, cy + hh], [cx + hw, cy + hh]],
        o: [[0, 0], [0, 0], [0, 0], [0, 0]],
        i: [[0, 0], [0, 0], [0, 0], [0, 0]],
        c: true
    };
}

// --- Extract transform position and anchor from a Lottie tr item ---
function extractGroupTransform(trItem) {
    if (!trItem) return { px: 0, py: 0, ax: 0, ay: 0 };
    var tp = trItem.p && trItem.p.k ? trItem.p.k : (trItem.p || [0, 0]);
    var ta = trItem.a && trItem.a.k ? trItem.a.k : (trItem.a || [0, 0]);
    return {
        px: Array.isArray(tp) ? tp[0] : (tp.x || 0),
        py: Array.isArray(tp) ? tp[1] : (tp.y || 0),
        ax: Array.isArray(ta) ? ta[0] : (ta.x || 0),
        ay: Array.isArray(ta) ? ta[1] : (ta.y || 0)
    };
}

// --- Recursively collect shapes from nested Lottie groups ---
// Accumulates transforms (tr.p - tr.a) across nesting levels and inherits
// fill/gradient/stroke from ancestor groups so deeply-nested shapes are found.
// Detects compound paths: when sibling sub-groups each have a path but no
// individual fill, and a shared fill exists at this level, they are merged
// into a single result with isCompound=true for Even-Odd rendering.
function collectShapesFromItems(items, accX, accY, inheritedFill, inheritedGradient, inheritedStroke, inheritedHasFill, results) {
    var localFill = inheritedFill;
    var localGradient = inheritedGradient;
    var localStroke = inheritedStroke;
    var foundFill = inheritedHasFill;
    var localShapes = [];
    var trItem = null;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.ty === "fl") { localFill = extractFillColor(item); foundFill = true; localGradient = null; }
        if (item.ty === "gf") { localGradient = extractGradientInfo(item); foundFill = true; }
        if (item.ty === "st") localStroke = extractStrokeInfo(item);
        if (item.ty === "tr") trItem = item;
        if (item.ty === "sh") {
            localShapes.push({ pathData: getPathDataFromShapeKs(item.ks), pathKs: item.ks });
        }
        if (item.ty === "rc") {
            localShapes.push({ pathData: rectToPathData(item), pathKs: null });
        }
        if (item.ty === "el") {
            localShapes.push({ pathData: ellipseToPathData(item), pathKs: null });
        }
    }

    var tr = extractGroupTransform(trItem);
    var curX = accX + tr.px - tr.ax;
    var curY = accY + tr.py - tr.ay;

    for (var si = 0; si < localShapes.length; si++) {
        if (localShapes[si].pathData) {
            results.push({
                pathData: localShapes[si].pathData,
                pathKs: localShapes[si].pathKs,
                fillColor: localFill,
                gradientInfo: localGradient,
                groupOffset: [curX, curY],
                hasFill: foundFill,
                strokeInfo: localStroke,
                isCompound: false,
                compoundPaths: null
            });
        }
    }

    // Detect compound path pattern: multiple sibling sub-groups each containing
    // a path but no individual fill, with a shared fill at this level.
    var subGroups = [];
    for (var gi = 0; gi < items.length; gi++) {
        if (items[gi].ty === "gr" && items[gi].it) subGroups.push(items[gi]);
    }

    if (foundFill && subGroups.length > 1) {
        var compoundParts = [];
        var allQualify = true;
        for (var sg = 0; sg < subGroups.length; sg++) {
            var subItems = subGroups[sg].it;
            var subHasFill = false;
            var subHasPath = false;
            var subPathData = null;
            var subPathKs = null;
            var subTrItem = null;
            for (var si2 = 0; si2 < subItems.length; si2++) {
                if (subItems[si2].ty === "fl" || subItems[si2].ty === "gf") subHasFill = true;
                if (subItems[si2].ty === "sh") {
                    subHasPath = true;
                    subPathData = getPathDataFromShapeKs(subItems[si2].ks);
                    subPathKs = subItems[si2].ks;
                }
                if (subItems[si2].ty === "rc") {
                    subHasPath = true;
                    subPathData = rectToPathData(subItems[si2]);
                }
                if (subItems[si2].ty === "el") {
                    subHasPath = true;
                    subPathData = ellipseToPathData(subItems[si2]);
                }
                if (subItems[si2].ty === "tr") subTrItem = subItems[si2];
            }
            if (subHasFill || !subHasPath) { allQualify = false; break; }
            var subTr = extractGroupTransform(subTrItem);
            compoundParts.push({
                pathData: subPathData,
                pathKs: subPathKs,
                groupOffset: [curX + subTr.px - subTr.ax, curY + subTr.py - subTr.ay]
            });
        }
        if (allQualify && compoundParts.length > 1) {
            results.push({
                pathData: compoundParts[0].pathData,
                pathKs: null,
                fillColor: localFill,
                gradientInfo: localGradient,
                groupOffset: compoundParts[0].groupOffset,
                hasFill: true,
                strokeInfo: localStroke,
                isCompound: true,
                compoundPaths: compoundParts
            });
            return;
        }
    }

    for (var gi2 = 0; gi2 < subGroups.length; gi2++) {
        collectShapesFromItems(subGroups[gi2].it, curX, curY, localFill, localGradient, localStroke, foundFill, results);
    }
}

// --- Extract all shape groups from a shape layer (ty:4) ---
function getAllShapesFromLayer(layer) {
    var shapes = layer.shapes;
    if (!shapes) return [];
    // Pre-scan for top-level fill/gradient/stroke outside groups
    var topFill = "#ffffff";
    var topGradient = null;
    var topStroke = null;
    var topHasFill = false;
    for (var p = 0; p < shapes.length; p++) {
        if (shapes[p].ty === "fl") { topFill = extractFillColor(shapes[p]); topHasFill = true; topGradient = null; }
        if (shapes[p].ty === "gf") { topGradient = extractGradientInfo(shapes[p]); topHasFill = true; }
        if (shapes[p].ty === "st") topStroke = extractStrokeInfo(shapes[p]);
    }
    var result = [];
    for (var s = 0; s < shapes.length; s++) {
        var gr = shapes[s];
        if (gr.ty !== "gr" || !gr.it) continue;
        collectShapesFromItems(gr.it, 0, 0, topFill, topGradient, topStroke, topHasFill, result);
    }
    // Scan for trim path (ty=tm) at the shapes array level
    var trimItem = null;
    for (var t = 0; t < shapes.length; t++) {
        if (shapes[t].ty === "tm") { trimItem = shapes[t]; break; }
    }
    if (trimItem) {
        var startVal = getStaticValue(trimItem.s, 0);
        if (Array.isArray(startVal)) startVal = startVal[0];
        var endVal = getStaticValue(trimItem.e, 100);
        if (Array.isArray(endVal)) endVal = endVal[0];
        var trimInfo = {
            start: startVal,
            end: endVal,
            startKs: (trimItem.s && trimItem.s.a === 1) ? trimItem.s : null,
            endKs: (trimItem.e && trimItem.e.a === 1) ? trimItem.e : null
        };
        for (var ri = 0; ri < result.length; ri++) result[ri].trimInfo = trimInfo;
    }
    return result;
}

// --- Layer transform from Lottie ks (p, a, s, r) ---
// AE transform chain: translate(pos) * rotate(rot) * scale(s) * translate(-anchor)
// Cavalry has no anchor, so bake anchor into position using scale=100%.
// When scale is animated, keyframeAnimatedTransforms adds compensating
// position keyframes so the anchor pivot stays correct across time.
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

    // Always use scale=1 for anchor baking — gives correct position at 100%.
    var px = p[0] - a[0];
    var py = p[1] - a[1];

    if (!hasParent) {
        px -= compW / 2;
        py -= compH / 2;
    }
    var cavX = sc * px;
    var cavY = sc * (yFlip ? -py : py);
    var cavR = yFlip ? -r : r;

    var oVal = getStaticValue(ks.o, 100);
    if (Array.isArray(oVal)) oVal = oVal[0];

    return {
        position: [cavX, cavY],
        scale: [Array.isArray(s) ? s[0] : s, Array.isArray(s) ? s[1] : s],
        rotation: cavR,
        opacity: oVal
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
// precompDims: optional {w, h} for compositionReference layers. When provided,
// the anchor used for scale-position compensation is shifted by [-w/2, -h/2]
// so the precomp center tracks correctly as scale changes.
function keyframeAnimatedTransforms(nodeId, ks, yFlip, hasParent, compW, compH, scaleFactor, timeOffset, precompDims) {
    if (!ks) return;
    var tOff = timeOffset || 0;
    var sc = scaleFactor || 1;
    var a = getStaticValue(ks.a, [0, 0, 0]);
    var rawAx = Array.isArray(a) ? a[0] : 0;
    var rawAy = Array.isArray(a) ? a[1] : 0;
    var ax = precompDims ? (rawAx - precompDims.w / 2) : rawAx;
    var ay = precompDims ? (rawAy - precompDims.h / 2) : rawAy;
    var centX = hasParent ? 0 : compW / 2;
    var centY = hasParent ? 0 : compH / 2;
    var posAnimated = false;

    // Get static position for anchor-scale compensation
    var sp = getSplitPosition(ks);
    if (!sp) sp = getStaticValue(ks.p, [0, 0, 0]);
    if (!Array.isArray(sp)) sp = [0, 0, 0];
    var staticPosX = sp[0];
    var staticPosY = sp[1];

    if (ks.p && ks.p.s === true) {
        var pxProp = ks.p.x;
        var pyProp = ks.p.y;
        if (pxProp && pxProp.a === 1 && pxProp.k) {
            posAnimated = true;
            var pxKfs = [];
            for (var kpi = 0; kpi < pxProp.k.length; kpi++) {
                var kpx = pxProp.k[kpi];
                var frame = (kpx.t != null ? kpx.t : 0) + tOff;
                var vx = Array.isArray(kpx.s) ? kpx.s[0] : kpx.s;
                if (vx == null) continue;
                var px = sc * (vx - ax - centX);
                try {
                    api.keyframe(nodeId, frame, { "position.x": px });
                    pxKfs.push({ frame: frame, value: px });
                } catch (e) {}
            }
            applyLottieEasing(nodeId, "position.x", pxKfs, pxProp.k, 0);
        }
        if (pyProp && pyProp.a === 1 && pyProp.k) {
            posAnimated = true;
            var pyKfs = [];
            for (var kpi2 = 0; kpi2 < pyProp.k.length; kpi2++) {
                var kpy = pyProp.k[kpi2];
                var frame = (kpy.t != null ? kpy.t : 0) + tOff;
                var vy = Array.isArray(kpy.s) ? kpy.s[0] : kpy.s;
                if (vy == null) continue;
                var py = sc * (yFlip ? -(vy - ay - centY) : (vy - ay - centY));
                try {
                    api.keyframe(nodeId, frame, { "position.y": py });
                    pyKfs.push({ frame: frame, value: py });
                } catch (e) {}
            }
            applyLottieEasing(nodeId, "position.y", pyKfs, pyProp.k, 0);
        }
    } else if (ks.p && ks.p.a === 1 && ks.p.k && ks.p.k.length > 1) {
        posAnimated = true;
        var posXKfs = [];
        var posYKfs = [];
        for (var kp = 0; kp < ks.p.k.length; kp++) {
            var kpv = ks.p.k[kp];
            var frame = (kpv.t != null ? kpv.t : 0) + tOff;
            var v = kpv.s || kpv.k;
            if (!Array.isArray(v)) continue;
            var px = sc * (v[0] - ax - centX);
            var py = sc * (yFlip ? -(v[1] - ay - centY) : (v[1] - ay - centY));
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

        // When scale is animated and anchor is non-zero, the position must
        // compensate: effectivePos = pos - anchor * (scale/100). Since the
        // static position was baked with scale=1, we keyframe position at
        // each scale keyframe to maintain the correct anchor pivot.
        var needsAnchorComp = !posAnimated && (Math.abs(ax) > 0.001 || Math.abs(ay) > 0.001);
        var compPosXKfs = [];
        var compPosYKfs = [];

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

            if (needsAnchorComp) {
                var cpx = sc * (staticPosX - ax * sxVal - centX);
                var cpy = sc * (yFlip ? -(staticPosY - ay * syVal - centY) : (staticPosY - ay * syVal - centY));
                try {
                    api.keyframe(nodeId, frame, { "position.x": cpx, "position.y": cpy });
                    compPosXKfs.push({ frame: frame, value: cpx });
                    compPosYKfs.push({ frame: frame, value: cpy });
                } catch (e) {}
            }
        }
        applyLottieEasing(nodeId, "scale.x", scaleXKfs, ks.s.k, 0);
        applyLottieEasing(nodeId, "scale.y", scaleYKfs, ks.s.k, 1);
        if (needsAnchorComp && compPosXKfs.length > 0) {
            applyLottieEasing(nodeId, "position.x", compPosXKfs, ks.s.k, 0);
            applyLottieEasing(nodeId, "position.y", compPosYKfs, ks.s.k, 1);
        }
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

    if (ks.o && ks.o.a === 1 && ks.o.k && ks.o.k.length > 1) {
        var opKfs = [];
        for (var ko = 0; ko < ks.o.k.length; ko++) {
            var kov = ks.o.k[ko];
            var frame = (kov.t != null ? kov.t : 0) + tOff;
            var oRaw = kov.s !== undefined ? kov.s : kov.k;
            var oVal = Array.isArray(oRaw) ? oRaw[0] : oRaw;
            if (oVal == null) continue;
            var cavO = oVal / 100;
            try {
                api.keyframe(nodeId, frame, { "opacity": cavO });
                opKfs.push({ frame: frame, value: cavO });
            } catch (e) {}
        }
        applyLottieEasing(nodeId, "opacity", opKfs, ks.o.k, 0);
    }
}

// --- Keyframe a single numeric Lottie property ---
function keyframeSingleValue(nodeId, attrName, ks, timeOffset) {
    if (!ks || ks.a !== 1 || !ks.k || ks.k.length <= 1) return;
    var tOff = timeOffset || 0;
    var kfs = [];
    for (var ki = 0; ki < ks.k.length; ki++) {
        var kv = ks.k[ki];
        var frame = (kv.t != null ? kv.t : 0) + tOff;
        var val = kv.s !== undefined ? kv.s : kv.k;
        if (Array.isArray(val)) val = val[0];
        if (val === undefined) continue;
        var obj = {};
        obj[attrName] = val;
        try {
            api.keyframe(nodeId, frame, obj);
            kfs.push({ frame: frame, value: val });
        } catch (e) {}
    }
    applyLottieEasing(nodeId, attrName, kfs, ks.k, 0);
}

// --- Apply trim path properties to a shape node ---
function applyTrimPath(nodeId, trimInfo, tOff) {
    if (!trimInfo) return;
    api.setStroke(nodeId, true);
    api.set(nodeId, {
        "stroke.trim": 1,
        "stroke.trimStart": trimInfo.start,
        "stroke.trimEnd": trimInfo.end
    });
    if (trimInfo.startKs) keyframeSingleValue(nodeId, "stroke.trimStart", trimInfo.startKs, tOff);
    if (trimInfo.endKs) keyframeSingleValue(nodeId, "stroke.trimEnd", trimInfo.endKs, tOff);
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
        if (mask.mode === "d") continue;
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
            var maskKfCount = 0;
            for (var kf = 0; kf < pt.k.length; kf++) {
                var kfData = getPathDataAtKeyframe(pt, kf);
                if (!kfData) continue;
                var frame = getKeyframeTime(pt, kf) + tOff;
                var contour = lottiePathToContourData(kfData, yFlip, scaleFactor, [0, 0]);
                if (!contour) continue;
                try {
                    api.keyframe(maskId, frame, { "inputPath": contour });
                    maskKfCount++;
                } catch (e) {
                    console.log("Lottie Importer: Mask keyframe failed at frame " + frame + ": " + e.message);
                }
            }
            if (maskKfCount > 0) console.log("Lottie Importer: Applied " + maskKfCount + " keyframes to mask " + m);
        }
        for (var t = 0; t < targetIds.length; t++) {
            var maskConnected = false;
            try {
                api.connect(maskId, "id", targetIds[t], "masks." + m + ".id");
                maskConnected = true;
            } catch (e) {
                console.log("Lottie Importer: masks." + m + ".id connect err: " + e.message);
            }
            if (!maskConnected) {
                try {
                    api.connect(maskId, "id", targetIds[t], "masks." + m + ".id", true);
                    maskConnected = true;
                } catch (e2) {
                    console.log("Lottie Importer: masks." + m + ".id (forced) err: " + e2.message);
                }
            }
            if (!maskConnected) {
                try {
                    api.connect(maskId, "id", targetIds[t], "masks");
                    maskConnected = true;
                } catch (e3) {
                    console.log("Lottie Importer: masks append err: " + e3.message);
                }
            }
            if (maskConnected) {
                console.log("Lottie Importer: Connected mask " + m + " (mode: " + mask.mode + ") to " + targetIds[t]);
            }
        }
    }
}

// Import a set of layers (from a precomp or root), returning created Cavalry IDs.
// groupId: if provided, top-level layers are parented to this group and all
// layers are treated as having a parent (no root-comp centering on positions).
// timeOffset: accumulated precomp st offset for keyframe times.
function importLayerSet(layers, assets, yFlip, scaleFactor, compW, compH, groupId, timeOffset, precompCache, frameRate) {
    var tOff = timeOffset || 0;
    var parentIndSet = {};
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].parent != null) parentIndSet[layers[i].parent] = true;
    }

    var processLayers = [];
    for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        if (l.ty === 0) {
            processLayers.push({ index: i, layer: l, kind: "precomp", precompW: l.w || 0, precompH: l.h || 0 });
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
    var targetIdsByInd = {};
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
            var childSt = layer.st != null ? layer.st : 0;
            var assetW = layer.w || asset.w || compW;
            var assetH = layer.h || asset.h || compH;

            if (!precompCache[assetId]) {
                var savedComp = api.getActiveComp();
                try {
                    var compName = asset.nm || name || asset.id;
                    var newCompId = api.createComp(compName);
                    precompCache[assetId] = newCompId;
                    api.setActiveComp(newCompId);
                    try {
                        var compProps = {
                            "resolution.x": Math.round(assetW * scaleFactor),
                            "resolution.y": Math.round(assetH * scaleFactor),
                            "backgroundColor.a": 0
                        };
                        if (frameRate) compProps["fps"] = frameRate;
                        api.set(newCompId, compProps);
                    } catch (e) {}
                    importLayerSet(asset.layers, assets, yFlip, scaleFactor, assetW, assetH, null, 0, precompCache, frameRate);
                } catch (e) {
                    console.log("Lottie Importer: Could not create precomp '" + name + "': " + e.message);
                    api.setActiveComp(savedComp);
                    continue;
                }
                api.setActiveComp(savedComp);
            }

            try {
                nodeId = api.createCompReference(precompCache[assetId]);
                api.rename(nodeId, name);
            } catch (e) {
                console.log("Lottie Importer: Could not create comp reference '" + name + "': " + e.message);
                continue;
            }

            if (childSt !== 0) {
                try { api.offsetLayerTime(nodeId, childSt); } catch (e) {}
            }
            applyMasks(layer, [nodeId], yFlip, scaleFactor, nodeId, tOff);
            targetIdsByInd[layer.ind] = [nodeId];
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
            if (shapeList.length === 1 && shapeList[0].isCompound && shapeList[0].compoundPaths) {
                var s0c = shapeList[0];
                var combinedPath = new cavalry.Path();
                for (var cp = 0; cp < s0c.compoundPaths.length; cp++) {
                    appendLottiePathToCavalryPath(combinedPath, s0c.compoundPaths[cp].pathData,
                        yFlip, scaleFactor, s0c.compoundPaths[cp].groupOffset);
                }
                try {
                    nodeId = api.createEditable(combinedPath, name);
                } catch (e) {
                    console.log("Lottie Importer: Could not create compound shape '" + name + "': " + e.message);
                    continue;
                }
                api.setFill(nodeId, true);
                api.set(nodeId, { "fillRule": 0 });
                if (s0c.gradientInfo) {
                    applyGradientFill(nodeId, s0c.gradientInfo, scaleFactor);
                } else {
                    api.set(nodeId, { "material.materialColor": s0c.fillColor });
                }
                if (s0c.strokeInfo) {
                    api.setStroke(nodeId, true);
                    api.set(nodeId, {
                        "stroke.strokeColor": s0c.strokeInfo.color,
                        "stroke.width": s0c.strokeInfo.width * scaleFactor
                    });
                }
                applyTrimPath(nodeId, s0c.trimInfo, tOff);
                targetIds = [nodeId];
            } else if (shapeList.length === 1) {
                var s0 = shapeList[0];
                var path = lottiePathToCavalryPath(s0.pathData, yFlip, scaleFactor, s0.groupOffset);
                if (!path) continue;
                try {
                    nodeId = api.createEditable(path, name);
                } catch (e) {
                    console.log("Lottie Importer: Could not create shape '" + name + "': " + e.message);
                    continue;
                }
                if (s0.hasFill) {
                    api.setFill(nodeId, true);
                    api.set(nodeId, { "fillRule": 1 });
                    if (s0.gradientInfo) {
                        applyGradientFill(nodeId, s0.gradientInfo, scaleFactor);
                    } else {
                        api.set(nodeId, { "material.materialColor": s0.fillColor });
                    }
                } else {
                    api.setFill(nodeId, false);
                }
                if (s0.strokeInfo) {
                    api.setStroke(nodeId, true);
                    api.set(nodeId, {
                        "stroke.strokeColor": s0.strokeInfo.color,
                        "stroke.width": s0.strokeInfo.width * scaleFactor
                    });
                }
                applyTrimPath(nodeId, s0.trimInfo, tOff);
                animateShapePath(nodeId, s0.pathKs, yFlip, scaleFactor, s0.groupOffset, tOff);
                targetIds = [nodeId];
            } else {
                try {
                    nodeId = createGroup(name);
                } catch (e) {
                    console.log("Lottie Importer: Could not create group '" + name + "': " + e.message);
                    continue;
                }
                for (var ss = shapeList.length - 1; ss >= 0; ss--) {
                    var s = shapeList[ss];
                    var subId;
                    if (s.isCompound && s.compoundPaths) {
                        var cPath = new cavalry.Path();
                        for (var cp2 = 0; cp2 < s.compoundPaths.length; cp2++) {
                            appendLottiePathToCavalryPath(cPath, s.compoundPaths[cp2].pathData,
                                yFlip, scaleFactor, s.compoundPaths[cp2].groupOffset);
                        }
                        try {
                            subId = api.createEditable(cPath, name + " " + (ss + 1));
                        } catch (e) { continue; }
                        api.setFill(subId, true);
                        api.set(subId, { "fillRule": 0 });
                        if (s.gradientInfo) {
                            applyGradientFill(subId, s.gradientInfo, scaleFactor);
                        } else {
                            api.set(subId, { "material.materialColor": s.fillColor });
                        }
                        if (s.strokeInfo) {
                            api.setStroke(subId, true);
                            api.set(subId, {
                                "stroke.strokeColor": s.strokeInfo.color,
                                "stroke.width": s.strokeInfo.width * scaleFactor
                            });
                        }
                        applyTrimPath(subId, s.trimInfo, tOff);
                    } else {
                        var sp = lottiePathToCavalryPath(s.pathData, yFlip, scaleFactor, s.groupOffset);
                        if (!sp) continue;
                        try {
                            subId = api.createEditable(sp, name + " " + (ss + 1));
                        } catch (e) { continue; }
                        if (s.hasFill) {
                            api.setFill(subId, true);
                            api.set(subId, { "fillRule": 1 });
                            if (s.gradientInfo) {
                                applyGradientFill(subId, s.gradientInfo, scaleFactor);
                            } else {
                                api.set(subId, { "material.materialColor": s.fillColor });
                            }
                        } else {
                            api.setFill(subId, false);
                        }
                        if (s.strokeInfo) {
                            api.setStroke(subId, true);
                            api.set(subId, {
                                "stroke.strokeColor": s.strokeInfo.color,
                                "stroke.width": s.strokeInfo.width * scaleFactor
                            });
                        }
                        applyTrimPath(subId, s.trimInfo, tOff);
                        animateShapePath(subId, s.pathKs, yFlip, scaleFactor, s.groupOffset, tOff);
                    }
                    try { api.parent(subId, nodeId); } catch (e) {}
                    targetIds.push(subId);
                }
            }
            applyMasks(layer, targetIds, yFlip, scaleFactor, nodeId, tOff);
            targetIdsByInd[layer.ind] = targetIds;
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

    // Pass 2b: Track mattes (td/tt/tp)
    // td=1 marks a matte source; tt on the matted layer selects the matte type;
    // tp points to the matte source's ind.
    for (var tm = 0; tm < layers.length; tm++) {
        var matted = layers[tm];
        if (!matted.tt) continue;
        var matteInd = matted.tp;
        if (matteInd == null) {
            for (var mp = tm - 1; mp >= 0; mp--) {
                if (layers[mp].td === 1) { matteInd = layers[mp].ind; break; }
            }
        }
        if (matteInd == null) continue;
        var matteId = idByInd[matteInd];
        if (!matteId) {
            console.log("Lottie Importer: Track matte source ind=" + matteInd + " not found in idByInd");
            continue;
        }
        var mattedTargets = targetIdsByInd[matted.ind];
        if (!mattedTargets || mattedTargets.length === 0) {
            var fallback = idByInd[matted.ind];
            if (fallback) mattedTargets = [fallback];
        }
        if (!mattedTargets) {
            console.log("Lottie Importer: Track matte target ind=" + matted.ind + " not found");
            continue;
        }
        try { api.set(matteId, { "hidden": true }); }
        catch (e) { console.log("Lottie Importer: Could not hide matte " + matteId + ": " + e.message); }
        for (var mt = 0; mt < mattedTargets.length; mt++) {
            var connected = false;
            try {
                api.connect(matteId, "id", mattedTargets[mt], "masks.0.id");
                connected = true;
            } catch (e) {
                console.log("Lottie Importer: Track matte masks.0.id err: " + e.message);
            }
            if (!connected) {
                try {
                    api.connect(matteId, "id", mattedTargets[mt], "masks.0.id", true);
                    connected = true;
                } catch (e2) {
                    console.log("Lottie Importer: Track matte masks.0.id (forced) err: " + e2.message);
                }
            }
            if (!connected) {
                try {
                    api.connect(matteId, "id", mattedTargets[mt], "masks");
                    connected = true;
                } catch (e3) {
                    console.log("Lottie Importer: Track matte masks append err: " + e3.message);
                }
            }
            if (connected) {
                console.log("Lottie Importer: Connected track matte " + matteId + " -> " + mattedTargets[mt]);
            } else {
                console.log("Lottie Importer: All track matte connect attempts failed for " + mattedTargets[mt]);
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

        // Cavalry compositionReferences are positioned by their center.
        // getLayerTransform bakes position as (pos - anchor). For precomps the
        // correct center is: position + Scale * ([w/2, h/2] - anchor).
        // Delta vs current = ((w/2 - ax)*sx + ax) for X, -((h/2 - ay)*sy + ay) for Y.
        var precompDims = null;
        if (entry.kind === "precomp" && entry.precompW && entry.precompH) {
            var aPC = getStaticValue(tLayer.ks.a, [0, 0, 0]);
            var pcAx = Array.isArray(aPC) ? aPC[0] : 0;
            var pcAy = Array.isArray(aPC) ? aPC[1] : 0;
            var lsx = transform.scale[0] / 100;
            var lsy = transform.scale[1] / 100;
            transform.position[0] += scaleFactor * ((entry.precompW / 2 - pcAx) * lsx + pcAx);
            transform.position[1] -= scaleFactor * ((entry.precompH / 2 - pcAy) * lsy + pcAy);
            precompDims = { w: entry.precompW, h: entry.precompH };
        }

        var setProps = {
            "position": transform.position,
            "rotation.z": transform.rotation,
            "scale.x": transform.scale[0] / 100,
            "scale.y": transform.scale[1] / 100
        };
        if (transform.opacity != null && transform.opacity < 100) {
            setProps["opacity"] = transform.opacity / 100;
        }
        api.set(tId, setProps);
        keyframeAnimatedTransforms(tId, tLayer.ks, yFlip, hasParent, compW, compH, scaleFactor, tOff, precompDims);
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
            if (api.hasAttribute(activeComp, "resolution.x")) cavCompW = api.get(activeComp, "resolution.x");
            if (api.hasAttribute(activeComp, "resolution.y")) cavCompH = api.get(activeComp, "resolution.y");
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

    var precompCache = {};
    var allCreatedIds = importLayerSet(rootLayers, assets, yFlip, scaleFactor, compInfo.w, compInfo.h, null, 0, precompCache, compInfo.fr);

    if (allCreatedIds.length === 0) throw new Error("No shape layers found in this Lottie.");
    api.select(allCreatedIds);
    return allCreatedIds.length;
}
