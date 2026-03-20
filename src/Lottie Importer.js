// Lottie Importer for Cavalry
// Imports Lottie JSON animations as native Cavalry layers.
// Supports: Shape (ty=4), Solid (ty=1), Image (ty=2), Text (ty=5), Null (ty=3),
// Precomp (ty=0) layers. Shapes include Path, Rectangle, Ellipse, PolyStar, Groups.
// Styles: Fill, Gradient Fill/Stroke, Stroke (color/width/cap/join/dash/opacity),
// Trim Path (start/end/travel), Rounded Corners, Offset Path, Blend Modes.
// Transforms: Position, Anchor, Scale, Rotation, Opacity, Skew — with animated
// keyframes, bezier easing, hold keyframes, and group transform propagation.
// Also: Parenting, track mattes, masks, compound paths, repeaters, precomps.

// Check Update from Github
var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "Lottie Importer";
var currentVersion = "1.0.0";

function compareVersions(v1, v2) {
    var parts1 = v1.split('.').map(function(n) { return parseInt(n, 10) || 0; });
    var parts2 = v2.split('.').map(function(n) { return parseInt(n, 10) || 0; });
    for (var i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        var num1 = parts1[i] || 0;
        var num2 = parts2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

function checkForUpdate(githubRepo, scriptName, currentVersion, callback) {
    var now = new Date().getTime();
    var oneDayAgo = now - (24 * 60 * 60 * 1000);
    var shouldFetchFromGithub = true;
    var cachedLatestVersion = null;
    if (api.hasPreferenceObject(scriptName + "_update_check")) {
        var prefs = api.getPreferenceObject(scriptName + "_update_check");
        cachedLatestVersion = prefs.latestVersion;
        if (prefs.lastCheck && prefs.lastCheck > oneDayAgo) {
            shouldFetchFromGithub = false;
        }
    }
    if (!shouldFetchFromGithub && cachedLatestVersion) {
        var updateAvailable = compareVersions(cachedLatestVersion, currentVersion) > 0;
        if (updateAvailable) {
            console.warn(scriptName + ' ' + cachedLatestVersion + ' update available (you have ' + currentVersion + '). Download at github.com/' + githubRepo);
            if (callback) callback(true, cachedLatestVersion);
        } else {
            if (callback) callback(false);
        }
        return;
    }
    try {
        var path = "/" + githubRepo + "/main/versions.json";
        var client = new api.WebClient("https://raw.githubusercontent.com");
        client.get(path);
        if (client.status() === 200) {
            var versions = JSON.parse(client.body());
            var latestVersion = versions[scriptName];
            if (!latestVersion) {
                console.warn("Version check: Script name '" + scriptName + "' not found in versions.json");
                if (callback) callback(false);
                return;
            }
            if (latestVersion.indexOf && latestVersion.indexOf('v') === 0) {
                latestVersion = latestVersion.substring(1);
            }
            api.setPreferenceObject(scriptName + "_update_check", {
                lastCheck: new Date().getTime(),
                latestVersion: latestVersion
            });
            var updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
            if (updateAvailable) {
                console.warn(scriptName + ' ' + latestVersion + ' update available (you have ' + currentVersion + '). Download at github.com/' + githubRepo);
                if (callback) callback(true, latestVersion);
            } else {
                if (callback) callback(false);
            }
        } else {
            console.log("Version check: Unable to fetch versions.json (HTTP " + client.status() + ")");
            if (callback) callback(false);
        }
    } catch (e) {
        console.log("Version check: Error - " + e.message);
        if (callback) callback(false);
    }
}

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
        var errMsg = (e && e.message) ? e.message : String(e);
        if (e && e.stack) console.log("Lottie import stack: " + e.stack);
        console.log("Lottie import error: " + errMsg);
        statusLabel.setText("Error: " + errMsg);
    }
};

ui.add(statusLabel);
ui.addSpacing(10);
ui.add(importButton);

checkForUpdate(GITHUB_REPO, scriptName, currentVersion, function(updateAvailable, newVersion) {
    if (updateAvailable) {
        statusLabel.setText("Update " + newVersion + " available!");
    }
});

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
// Convert a single Lottie path to a Cavalry contour object {closed, points}.
function lottiePathToSingleContour(pathData, yFlip, scale, groupOffset) {
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
    return { closed: c, points: points };
}

// Native editablePath2 structure for api.keyframe() — wraps a single contour.
function lottiePathToContourData(pathData, yFlip, scale, groupOffset) {
    var contour = lottiePathToSingleContour(pathData, yFlip, scale, groupOffset);
    if (!contour) return null;
    return { contours: [contour], fillType: 0, version: 1 };
}

// Unwrap Lottie path keyframe value: may be {v,i,o,c} or [{v,i,o,c}] (Bodymovin formatProperty).
function normalizeLottiePathShape(s) {
    if (!s) return null;
    if (s.v && Array.isArray(s.v)) return s;
    if (Array.isArray(s) && s[0] && s[0].v && Array.isArray(s[0].v)) return s[0];
    return null;
}

function getPathDataFromShapeKs(ks) {
    if (!ks) return null;
    if (ks.a === 0 && ks.k) {
        if (ks.k.v && Array.isArray(ks.k.v)) return ks.k;
        return null;
    }
    if (ks.a === 1 && ks.k && ks.k.length > 0) {
        var sk = ks.k[0].s;
        return normalizeLottiePathShape(sk);
    }
    if (ks.k && Array.isArray(ks.k) && ks.k.length > 0 && ks.k[0] && typeof ks.k[0] === "object" && ks.k[0].s !== undefined) {
        return normalizeLottiePathShape(ks.k[0].s);
    }
    return null;
}

function getPathDataAtKeyframe(ks, keyframeIndex) {
    if (!ks || !ks.k || !ks.k[keyframeIndex]) return null;
    var s = ks.k[keyframeIndex].s;
    if (s === undefined) return null;
    return normalizeLottiePathShape(s);
}

function getKeyframeTime(ks, keyframeIndex) {
    if (!ks || !ks.k || !ks.k[keyframeIndex]) return 0;
    return ks.k[keyframeIndex].t != null ? ks.k[keyframeIndex].t : 0;
}

// Lottie 5.7+ often omits "a":1 when k is already a keyframe array [{t,s,i,o}, ...].
function isLottieKeyframeStyleArray(k) {
    if (!k || !Array.isArray(k) || k.length === 0) return false;
    var f = k[0];
    if (f == null || typeof f !== "object") return false;
    return f.s !== undefined || f.t !== undefined || f.h !== undefined || f.i !== undefined || f.o !== undefined;
}

function pathKsIsAnimated(ks) {
    if (!ks || !ks.k || !Array.isArray(ks.k) || ks.k.length <= 1) return false;
    if (ks.a === 1) return true;
    return isLottieKeyframeStyleArray(ks.k);
}

function singleValuePropIsAnimated(ks) {
    if (!ks || !ks.k || !Array.isArray(ks.k) || ks.k.length <= 1) return false;
    if (ks.a === 1) return true;
    return isLottieKeyframeStyleArray(ks.k);
}

// --- Extract static value from Lottie transform property (handles animated) ---
function getStaticValue(prop, fallback) {
    if (!prop) return fallback;
    if (prop.a === 1 && prop.k && prop.k.length > 0 && prop.k[0].s !== undefined) {
        return prop.k[0].s;
    }
    // Keyframed but "a" omitted: k is [{s,t,...}, ...] — use first keyframe value
    if (prop.k && Array.isArray(prop.k) && prop.k.length > 0) {
        var k0 = prop.k[0];
        if (k0 && typeof k0 === "object" && k0.s !== undefined) {
            return k0.s;
        }
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

// Gradient shaders are not cached: generator.offset/scale are per-shape (see applyGradientFill).

// --- Extract gradient fill info from Lottie gf item (or synthetic gf-shaped object for gs) ---
function extractGradientInfo(gfItem) {
    if (!gfItem || gfItem.ty !== "gf") return null;
    var type = gfItem.t || 1;
    var startPt = getStaticValue(gfItem.s, [0, 0]);
    var endPt = getStaticValue(gfItem.e, [0, 0]);
    if (!Array.isArray(startPt)) startPt = [0, 0];
    if (!Array.isArray(endPt)) endPt = [0, 0];
    var hVal = getStaticValue(gfItem.h != null ? gfItem.h : { k: 0 }, 0);
    if (Array.isArray(hVal)) hVal = hVal[0];
    if (typeof hVal !== "number") hVal = 0;
    var aVal = getStaticValue(gfItem.a != null ? gfItem.a : { k: 0 }, 0);
    if (Array.isArray(aVal)) aVal = aVal[0];
    if (typeof aVal !== "number") aVal = 0;
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

    return {
        type: type,
        startPt: startPt,
        endPt: endPt,
        stops: stops,
        highlightH: hVal,
        highlightADeg: aVal,
        sProp: gfItem.s,
        eProp: gfItem.e
    };
}

// Set attribute only if it exists on the node (avoids Cavalry console spam for missing generator.* paths).
function cavalrySetIfAttr(nodeId, attrPath, value) {
    try {
        if (typeof api.hasAttribute === "function" && !api.hasAttribute(nodeId, attrPath)) return;
        var one = {};
        one[attrPath] = value;
        api.set(nodeId, one);
    } catch (e) {}
}

// Lottie gradient s/e are in the same space as path verts; convert to Cavalry local (matches lottiePathToSingleContour).
function lottieGradientEndpointsToCavalry(sx, sy, ex, ey, scaleFactor, yFlip, groupOffset) {
    var gx = groupOffset && groupOffset[0] != null ? groupOffset[0] : 0;
    var gy = groupOffset && groupOffset[1] != null ? groupOffset[1] : 0;
    var mul = yFlip ? -1 : 1;
    var p1x = scaleFactor * (sx + gx);
    var p1y = scaleFactor * mul * (sy + gy);
    var p2x = scaleFactor * (ex + gx);
    var p2y = scaleFactor * mul * (ey + gy);
    return { p1x: p1x, p1y: p1y, p2x: p2x, p2y: p2y };
}

function applyGradientFill(shapeId, gradInfo, scaleFactor, yFlip, groupOffset) {
    if (!gradInfo || !gradInfo.stops || gradInfo.stops.length < 2) return;
    var gx = groupOffset && groupOffset[0] != null ? groupOffset[0] : 0;
    var gy = groupOffset && groupOffset[1] != null ? groupOffset[1] : 0;
    try {
        var typeName = gradInfo.type === 2 ? "Radial" : "Linear";
        var firstColor = gradInfo.stops[0].color.toUpperCase();
        var lastColor = gradInfo.stops[gradInfo.stops.length - 1].color.toUpperCase();
        var gradLabel = typeName + " Gradient " + firstColor + " -> " + lastColor;
        var gradientId = api.create("gradientShader", gradLabel);
        var genType = gradInfo.type === 2 ? "radialGradientShader" : "linearGradientShader";
        try {
            if (typeof api.setGenerator === "function") {
                api.setGenerator(gradientId, "generator", genType);
            } else {
                api.set(gradientId, { "generator": genType });
            }
        } catch (e) {
            try {
                api.set(gradientId, { "generator": genType });
            } catch (e2) {
                try { api.set(gradientId, { "generator": "linearGradientShader" }); } catch (e3) {}
            }
        }

        var colors = [];
        for (var ci = 0; ci < gradInfo.stops.length; ci++) colors.push(gradInfo.stops[ci].color);
        api.setGradientFromColors(gradientId, "generator.gradient", colors);

        for (var pi = 0; pi < gradInfo.stops.length; pi++) {
            var posObj = {};
            posObj["generator.gradient." + pi + ".position"] = gradInfo.stops[pi].position;
            api.set(gradientId, posObj);
        }

        var bbox = null;
        try {
            bbox = api.getBoundingBox(shapeId, false);
        } catch (eB) {}
        var shapeCx = 0;
        var shapeCy = 0;
        var shapeW = 1;
        var shapeH = 1;
        if (bbox && bbox.width > 1e-8 && bbox.height > 1e-8) {
            shapeCx = bbox.x + bbox.width / 2;
            shapeCy = bbox.y + bbox.height / 2;
            shapeW = bbox.width;
            shapeH = bbox.height;
        }

        var sx = gradInfo.startPt[0];
        var sy = gradInfo.startPt[1];
        var ex = gradInfo.endPt[0];
        var ey = gradInfo.endPt[1];
        var cav = lottieGradientEndpointsToCavalry(sx, sy, ex, ey, scaleFactor, yFlip, groupOffset);

        if (gradInfo.type === 2) {
            // Radial: only attributes that exist on this Cavalry build (no focalOffset in API).
            cavalrySetIfAttr(gradientId, "generator.radiusMode", 1);
            cavalrySetIfAttr(gradientId, "generator.radiusRatio", 1);

            var radLottie = Math.sqrt((ex - sx) * (ex - sx) + (ey - sy) * (ey - sy));
            var radiusPx = scaleFactor * radLottie;
            var offX = cav.p1x - shapeCx;
            var offY = cav.p1y - shapeCy;
            var refDim = Math.max(shapeW, shapeH);
            var scaleR = refDim > 1e-8 ? radiusPx / refDim : 1;
            if (scaleR < 0.001) scaleR = 0.001;
            if (scaleR > 1000) scaleR = 1000;

            cavalrySetIfAttr(gradientId, "generator.offset.x", offX);
            cavalrySetIfAttr(gradientId, "generator.offset.y", offY);
            cavalrySetIfAttr(gradientId, "generator.scale", scaleR);
            if (typeof api.hasAttribute === "function" && !api.hasAttribute(gradientId, "generator.scale")) {
                var scalePct = refDim > 1e-8 ? (radiusPx / (refDim / 2)) * 100 : 100;
                if (scalePct < 0.01) scalePct = 0.01;
                if (scalePct > 10000) scalePct = 10000;
                cavalrySetIfAttr(gradientId, "generator.scale.x", scalePct);
                cavalrySetIfAttr(gradientId, "generator.scale.y", scalePct);
            }
            // Lottie highlight (h, a) moves the radial focal point; Cavalry has no focal API — offset/rotation only approximate.
        } else {
            var gcX = (cav.p1x + cav.p2x) / 2;
            var gcY = (cav.p1y + cav.p2y) / 2;
            var dvx = cav.p2x - cav.p1x;
            var dvy = cav.p2y - cav.p1y;
            var gradLen = Math.sqrt(dvx * dvx + dvy * dvy);
            var offXL = gcX - shapeCx;
            var offYL = gcY - shapeCy;
            var refDim = Math.max(shapeW, shapeH);
            var scaleL = refDim > 1e-8 ? gradLen / refDim : 1;
            if (scaleL < 0.001) scaleL = 0.001;
            if (scaleL > 1000) scaleL = 1000;
            var rotDeg = Math.atan2(dvy, dvx) * (180 / Math.PI);

            cavalrySetIfAttr(gradientId, "generator.rotation", rotDeg);
            cavalrySetIfAttr(gradientId, "generator.offset.x", offXL);
            cavalrySetIfAttr(gradientId, "generator.offset.y", offYL);
            cavalrySetIfAttr(gradientId, "generator.scale", scaleL);
        }

        api.addArrayIndex(shapeId, "material.colorShaders");
        api.connect(gradientId, "id", shapeId, "material.colorShaders.0.shader");
        // Hide base fill colour so the gradient shader shows (matches Quiver connectShaderToShape).
        try {
            api.set(shapeId, { "material.materialColor.a": 0 });
        } catch (eA) {
            try { api.set(shapeId, { "material.materialColor": "#00000000" }); } catch (eA2) {}
        }
        try { api.set(shapeId, { "material.alpha": 100 }); } catch (eM) {}
    } catch (e) {
        console.log("Lottie Importer: Could not apply gradient: " + e.message);
    }
}

// --- Lottie blend mode to Cavalry enum mapping ---
var LOTTIE_BLEND_MODE_MAP = [
    0,  // 0: Normal -> 0
    24, // 1: Multiply -> 24
    14, // 2: Screen -> 14
    15, // 3: Overlay -> 15
    16, // 4: Darken -> 16
    17, // 5: Lighten -> 17
    18, // 6: Color Dodge -> 18
    19, // 7: Color Burn -> 19
    20, // 8: Hard Light -> 20
    21, // 9: Soft Light -> 21
    22, // 10: Difference -> 22
    23, // 11: Exclusion -> 23
    25, // 12: Hue -> 25
    26, // 13: Saturation -> 26
    27, // 14: Color -> 27
    28  // 15: Luminosity -> 28
];

function lottieBlendModeToCavalry(bm) {
    if (bm == null || bm === 0) return 0;
    if (bm >= 0 && bm < LOTTIE_BLEND_MODE_MAP.length) return LOTTIE_BLEND_MODE_MAP[bm];
    return 0;
}

function applyBlendModeToNode(nodeId, bm) {
    var cavEnum = lottieBlendModeToCavalry(bm);
    if (cavEnum !== 0) {
        try { api.set(nodeId, { "blendMode": cavEnum }); } catch (e) {}
    }
}

// --- Extract fill opacity from Lottie fill item ---
function extractFillOpacity(flItem) {
    if (!flItem || flItem.ty !== "fl" || !flItem.o) return 100;
    var oVal = getStaticValue(flItem.o, 100);
    if (Array.isArray(oVal)) oVal = oVal[0];
    return oVal;
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
    var oVal = 100;
    if (stItem.o) {
        oVal = getStaticValue(stItem.o, 100);
        if (Array.isArray(oVal)) oVal = oVal[0];
    }
    var lineCap = stItem.lc || 0;
    var lineJoin = stItem.lj || 0;
    var miterLimit = stItem.ml || stItem.ml2 || 4;
    if (typeof miterLimit === "object") miterLimit = getStaticValue(miterLimit, 4);
    var dashes = null;
    if (stItem.d && Array.isArray(stItem.d)) {
        dashes = [];
        for (var di = 0; di < stItem.d.length; di++) {
            var de = stItem.d[di];
            var dv = de.v ? getStaticValue(de.v, 0) : 0;
            if (Array.isArray(dv)) dv = dv[0];
            dashes.push({ n: de.n || "d", v: dv });
        }
    }
    var cKs = (stItem.c && singleValuePropIsAnimated(stItem.c)) ? stItem.c : null;
    var wKs = (stItem.w && singleValuePropIsAnimated(stItem.w)) ? stItem.w : null;
    return {
        color: color, width: w, opacity: oVal,
        lineCap: lineCap, lineJoin: lineJoin, miterLimit: miterLimit,
        dashes: dashes, colorKs: cKs, widthKs: wKs
    };
}

// --- Extract gradient stroke info from Lottie gs item ---
function extractGradientStrokeInfo(gsItem) {
    if (!gsItem || gsItem.ty !== "gs") return null;
    var gradInfo = extractGradientInfo({
        ty: "gf",
        t: gsItem.t,
        s: gsItem.s,
        e: gsItem.e,
        g: gsItem.g,
        h: gsItem.h,
        a: gsItem.a
    });
    var w = 2;
    if (gsItem.w) {
        var wVal = getStaticValue(gsItem.w, 2);
        w = Array.isArray(wVal) ? wVal[0] : wVal;
    }
    var oVal = 100;
    if (gsItem.o) {
        oVal = getStaticValue(gsItem.o, 100);
        if (Array.isArray(oVal)) oVal = oVal[0];
    }
    var lineCap = gsItem.lc || 0;
    var lineJoin = gsItem.lj || 0;
    var miterLimit = gsItem.ml || 4;
    return {
        color: "#000000", width: w, opacity: oVal,
        lineCap: lineCap, lineJoin: lineJoin, miterLimit: miterLimit,
        dashes: null, colorKs: null, widthKs: null,
        gradientInfo: gradInfo
    };
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

// Full comp rectangle in Lottie mask space (origin top-left, Y down) — matches
// lottie-web mask.js white rect when first mask is subtract/intersect.
function buildFullCompMaskPathData(w, h) {
    return {
        v: [[0, 0], [w, 0], [w, h], [0, h]],
        o: [[0, 0], [0, 0], [0, 0], [0, 0]],
        i: [[0, 0], [0, 0], [0, 0], [0, 0]],
        c: true
    };
}

// First mask that contributes to the stack (skip mode "n" and masks without path).
function getFirstEffectiveMaskMode(masks) {
    if (!masks) return null;
    for (var mi = 0; mi < masks.length; mi++) {
        var mask = masks[mi];
        if (mask.mode === "n") continue;
        if (!mask.pt) continue;
        if (!getPathDataFromShapeKs(mask.pt)) continue;
        return mask.mode;
    }
    return null;
}

var _lottieMaskPropsUnsupportedLogged = false;

// --- Extract full transform from a Lottie tr item ---
function extractGroupTransform(trItem) {
    if (!trItem) return { px: 0, py: 0, ax: 0, ay: 0, r: 0, sx: 100, sy: 100, opacity: 100, sk: 0, sa: 0 };
    var tp = trItem.p && trItem.p.k ? trItem.p.k : (trItem.p || [0, 0]);
    var ta = trItem.a && trItem.a.k ? trItem.a.k : (trItem.a || [0, 0]);
    var rVal = 0;
    if (trItem.r) {
        rVal = getStaticValue(trItem.r, 0);
        if (Array.isArray(rVal)) rVal = rVal[0];
    }
    var sVal = getStaticValue(trItem.s, [100, 100]);
    var sx = Array.isArray(sVal) ? sVal[0] : sVal;
    var sy = Array.isArray(sVal) ? sVal[1] : sVal;
    var oVal = 100;
    if (trItem.o) {
        oVal = getStaticValue(trItem.o, 100);
        if (Array.isArray(oVal)) oVal = oVal[0];
    }
    return {
        px: Array.isArray(tp) ? tp[0] : (tp.x || 0),
        py: Array.isArray(tp) ? tp[1] : (tp.y || 0),
        ax: Array.isArray(ta) ? ta[0] : (ta.x || 0),
        ay: Array.isArray(ta) ? ta[1] : (ta.y || 0),
        r: rVal, sx: sx, sy: sy, opacity: oVal,
        sk: trItem.sk ? (function() { var v = getStaticValue(trItem.sk, 0); return Array.isArray(v) ? v[0] : v; })() : 0,
        sa: trItem.sa ? (function() { var v = getStaticValue(trItem.sa, 0); return Array.isArray(v) ? v[0] : v; })() : 0
    };
}

// --- Transform a point by group scale and rotation around origin ---
function transformPoint(x, y, sx, sy, rotDeg) {
    var scaledX = x * (sx / 100);
    var scaledY = y * (sy / 100);
    if (Math.abs(rotDeg) < 0.001) return [scaledX, scaledY];
    var rad = rotDeg * Math.PI / 180;
    var cosR = Math.cos(rad);
    var sinR = Math.sin(rad);
    return [scaledX * cosR - scaledY * sinR, scaledX * sinR + scaledY * cosR];
}

// --- Transform Lottie path data vertices by group scale and rotation ---
function transformPathData(pathData, sx, sy, rotDeg) {
    if (!pathData || !pathData.v || (Math.abs(sx - 100) < 0.01 && Math.abs(sy - 100) < 0.01 && Math.abs(rotDeg) < 0.001)) return pathData;
    var v = [], inT = [], outT = [];
    for (var i = 0; i < pathData.v.length; i++) {
        var tv = transformPoint(pathData.v[i][0], pathData.v[i][1], sx, sy, rotDeg);
        v.push(tv);
        var ti = pathData.i[i] || [0, 0];
        var to = pathData.o[i] || [0, 0];
        var tis = transformPoint(ti[0], ti[1], sx, sy, rotDeg);
        var tos = transformPoint(to[0], to[1], sx, sy, rotDeg);
        inT.push(tis);
        outT.push(tos);
    }
    return { v: v, i: inT, o: outT, c: pathData.c };
}

// --- Recursively collect shapes from nested Lottie groups ---
function collectShapesFromItems(items, accX, accY, inheritedFill, inheritedGradient, inheritedStroke, inheritedHasFill, results, accSX, accSY, accR, accO, accFillOp) {
    var asx = accSX != null ? accSX : 100;
    var asy = accSY != null ? accSY : 100;
    var ar = accR || 0;
    var ao = accO != null ? accO : 100;
    var afo = accFillOp != null ? accFillOp : 100;
    var localFill = inheritedFill;
    var localGradient = inheritedGradient;
    var localStroke = inheritedStroke;
    var foundFill = inheritedHasFill;
    var localShapes = [];
    var trItem = null;
    var localFillOpacity = afo;
    var localFillColorKs = null;
    var localFillOpacityKs = null;
    var localRdValue = null;
    var localOpAmount = null;
    var localPolyStars = [];

    var localFillRule = null;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.hd === true) continue;
        if (item.ty === "fl") {
            localFill = extractFillColor(item);
            localFillOpacity = extractFillOpacity(item);
            localFillColorKs = (item.c && singleValuePropIsAnimated(item.c)) ? item.c : null;
            localFillOpacityKs = (item.o && singleValuePropIsAnimated(item.o)) ? item.o : null;
            foundFill = true;
            localGradient = null;
            if (item.r != null) localFillRule = item.r;
        }
        if (item.ty === "gf") { localGradient = extractGradientInfo(item); foundFill = true; }
        if (item.ty === "gs") {
            var gsInfo = extractGradientStrokeInfo(item);
            if (gsInfo) localStroke = gsInfo;
        }
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
        if (item.ty === "sr") {
            localPolyStars.push(item);
        }
        if (item.ty === "rp") {
            var rpCopies = getStaticValue(item.c, 3);
            if (Array.isArray(rpCopies)) rpCopies = rpCopies[0];
            var rpOff = getStaticValue(item.o, 0);
            if (Array.isArray(rpOff)) rpOff = rpOff[0];
            var rpTr = item.tr || {};
            var rpPx = rpTr.p ? getStaticValue(rpTr.p, [0, 0]) : [0, 0];
            var rpSc = rpTr.s ? getStaticValue(rpTr.s, [100, 100]) : [100, 100];
            var rpRot = rpTr.r ? getStaticValue(rpTr.r, 0) : 0;
            if (Array.isArray(rpRot)) rpRot = rpRot[0];
            var rpOp = rpTr.o ? getStaticValue(rpTr.o, 100) : 100;
            if (Array.isArray(rpOp)) rpOp = rpOp[0];
            var rpAx = rpTr.a ? getStaticValue(rpTr.a, [0, 0]) : [0, 0];
            item._rpData = {
                copies: Math.round(rpCopies), offset: rpOff,
                px: Array.isArray(rpPx) ? rpPx[0] : 0, py: Array.isArray(rpPx) ? rpPx[1] : 0,
                sx: Array.isArray(rpSc) ? rpSc[0] : 100, sy: Array.isArray(rpSc) ? rpSc[1] : 100,
                r: rpRot, opacity: rpOp,
                ax: Array.isArray(rpAx) ? rpAx[0] : 0, ay: Array.isArray(rpAx) ? rpAx[1] : 0
            };
        }
        if (item.ty === "rd") {
            var rdV = getStaticValue(item.r, 0);
            if (Array.isArray(rdV)) rdV = rdV[0];
            localRdValue = rdV;
        }
        if (item.ty === "op") {
            var opA = item.a ? getStaticValue(item.a, 0) : 0;
            if (Array.isArray(opA)) opA = opA[0];
            localOpAmount = opA;
        }
    }

    var tr = extractGroupTransform(trItem);
    var localDx = tr.px - tr.ax;
    var localDy = tr.py - tr.ay;
    var tPt = transformPoint(localDx, localDy, asx, asy, ar);
    var curX = accX + tPt[0];
    var curY = accY + tPt[1];
    var newSX = asx * (tr.sx / 100);
    var newSY = asy * (tr.sy / 100);
    var newR = ar + tr.r;
    var newO = ao * (tr.opacity / 100);

    if (localShapes.length > 1 && foundFill) {
        var compParts = [];
        for (var si = 0; si < localShapes.length; si++) {
            if (localShapes[si].pathData) {
                var pd = localShapes[si].pathData;
                if (Math.abs(newSX - 100) > 0.01 || Math.abs(newSY - 100) > 0.01 || Math.abs(newR) > 0.001) {
                    pd = transformPathData(pd, newSX, newSY, newR);
                }
                compParts.push({
                    pathData: pd,
                    pathKs: localShapes[si].pathKs,
                    groupOffset: [curX, curY]
                });
            }
        }
        if (compParts.length > 1) {
            results.push({
                pathData: compParts[0].pathData,
                pathKs: null,
                fillColor: localFill,
                gradientInfo: localGradient,
                groupOffset: compParts[0].groupOffset,
                hasFill: true,
                strokeInfo: localStroke,
                isCompound: true,
                compoundPaths: compParts,
                lottieFillRule: localFillRule,
                groupOpacity: newO,
                fillOpacity: localFillOpacity,
                fillColorKs: localFillColorKs,
                fillOpacityKs: localFillOpacityKs,
                rdValue: localRdValue,
                opAmount: localOpAmount,
                groupScaleX: newSX,
                groupScaleY: newSY
            });
        } else if (compParts.length === 1) {
            results.push({
                pathData: compParts[0].pathData,
                pathKs: localShapes[0].pathKs,
                fillColor: localFill,
                gradientInfo: localGradient,
                groupOffset: compParts[0].groupOffset,
                hasFill: foundFill,
                strokeInfo: localStroke,
                isCompound: false,
                compoundPaths: null,
                lottieFillRule: localFillRule,
                groupOpacity: newO,
                fillOpacity: localFillOpacity,
                fillColorKs: localFillColorKs,
                fillOpacityKs: localFillOpacityKs,
                rdValue: localRdValue,
                opAmount: localOpAmount,
                groupScaleX: newSX,
                groupScaleY: newSY
            });
        }
    } else {
        for (var si = 0; si < localShapes.length; si++) {
            if (localShapes[si].pathData) {
                var pd = localShapes[si].pathData;
                if (Math.abs(newSX - 100) > 0.01 || Math.abs(newSY - 100) > 0.01 || Math.abs(newR) > 0.001) {
                    pd = transformPathData(pd, newSX, newSY, newR);
                }
                results.push({
                    pathData: pd,
                    pathKs: localShapes[si].pathKs,
                    fillColor: localFill,
                    gradientInfo: localGradient,
                    groupOffset: [curX, curY],
                    hasFill: foundFill,
                    strokeInfo: localStroke,
                    isCompound: false,
                    compoundPaths: null,
                    lottieFillRule: localFillRule,
                    groupOpacity: newO,
                    fillOpacity: localFillOpacity,
                    fillColorKs: localFillColorKs,
                    fillOpacityKs: localFillOpacityKs,
                    rdValue: localRdValue,
                    opAmount: localOpAmount,
                    groupScaleX: newSX,
                    groupScaleY: newSY
                });
            }
        }
    }

    for (var psi = 0; psi < localPolyStars.length; psi++) {
        results.push({
            pathData: null,
            pathKs: null,
            fillColor: localFill,
            gradientInfo: localGradient,
            groupOffset: [curX, curY],
            hasFill: foundFill,
            strokeInfo: localStroke,
            isCompound: false,
            compoundPaths: null,
            lottieFillRule: localFillRule,
            groupOpacity: newO,
            fillOpacity: localFillOpacity,
            fillColorKs: localFillColorKs,
            fillOpacityKs: localFillOpacityKs,
            rdValue: localRdValue,
            opAmount: localOpAmount,
            polyStar: localPolyStars[psi],
            groupScaleX: newSX,
            groupScaleY: newSY
        });
    }

    // Repeater: duplicate shapes with baked transforms
    var rpItem = null;
    for (var rpi = 0; rpi < items.length; rpi++) {
        if (items[rpi].ty === "rp" && items[rpi]._rpData) { rpItem = items[rpi]; break; }
    }
    if (rpItem && rpItem._rpData) {
        var rp = rpItem._rpData;
        var origCount = results.length;
        var origResults = [];
        for (var ori = origCount - localShapes.length - localPolyStars.length; ori < origCount; ori++) {
            if (ori >= 0) origResults.push(results[ori]);
        }
        for (var ci = 1; ci < rp.copies; ci++) {
            var rpDx = rp.px * ci;
            var rpDy = rp.py * ci;
            var rpRot = rp.r * ci;
            var rpSx = Math.pow(rp.sx / 100, ci) * 100;
            var rpSy = Math.pow(rp.sy / 100, ci) * 100;
            var rpOp = Math.pow(rp.opacity / 100, ci) * 100;
            for (var oij = 0; oij < origResults.length; oij++) {
                var origShape = origResults[oij];
                var cloned = {};
                for (var pk in origShape) {
                    if (origShape.hasOwnProperty(pk)) cloned[pk] = origShape[pk];
                }
                if (cloned.pathData) {
                    cloned.pathData = transformPathData(cloned.pathData, rpSx, rpSy, rpRot);
                }
                cloned.groupOffset = [
                    (cloned.groupOffset ? cloned.groupOffset[0] : 0) + rpDx,
                    (cloned.groupOffset ? cloned.groupOffset[1] : 0) + rpDy
                ];
                if (cloned.groupOpacity != null) {
                    cloned.groupOpacity = cloned.groupOpacity * (rpOp / 100);
                }
                cloned.pathKs = null;
                results.push(cloned);
            }
        }
    }

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
            var sDx = subTr.px - subTr.ax;
            var sDy = subTr.py - subTr.ay;
            var sPt = transformPoint(sDx, sDy, newSX, newSY, newR);
            compoundParts.push({
                pathData: subPathData,
                pathKs: subPathKs,
                groupOffset: [curX + sPt[0], curY + sPt[1]]
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
                compoundPaths: compoundParts,
                lottieFillRule: localFillRule,
                groupOpacity: newO,
                fillOpacity: localFillOpacity,
                fillColorKs: localFillColorKs,
                fillOpacityKs: localFillOpacityKs,
                rdValue: localRdValue,
                opAmount: localOpAmount
            });
            return;
        }
    }

    for (var gi2 = 0; gi2 < subGroups.length; gi2++) {
        collectShapesFromItems(subGroups[gi2].it, curX, curY, localFill, localGradient, localStroke, foundFill, results, newSX, newSY, newR, newO, localFillOpacity);
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
        if (shapes[p].ty === "gs") {
            var gsInfo = extractGradientStrokeInfo(shapes[p]);
            if (gsInfo) topStroke = gsInfo;
        }
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
        var offVal = 0;
        if (trimItem.o) {
            offVal = getStaticValue(trimItem.o, 0);
            if (Array.isArray(offVal)) offVal = offVal[0];
        }
        var trimInfo = {
            start: startVal,
            end: endVal,
            offset: offVal,
            startKs: (trimItem.s && singleValuePropIsAnimated(trimItem.s)) ? trimItem.s : null,
            endKs: (trimItem.e && singleValuePropIsAnimated(trimItem.e)) ? trimItem.e : null,
            offsetKs: (trimItem.o && singleValuePropIsAnimated(trimItem.o)) ? trimItem.o : null
        };
        for (var ri = 0; ri < result.length; ri++) result[ri].trimInfo = trimInfo;
    }
    // Scan for top-level rounded corners (ty=rd) and offset path (ty=op)
    for (var mi = 0; mi < shapes.length; mi++) {
        if (shapes[mi].ty === "rd") {
            var rdVal = getStaticValue(shapes[mi].r, 0);
            if (Array.isArray(rdVal)) rdVal = rdVal[0];
            for (var ri2 = 0; ri2 < result.length; ri2++) {
                if (!result[ri2].rdValue) result[ri2].rdValue = rdVal;
            }
        }
        if (shapes[mi].ty === "op") {
            var opAmt = shapes[mi].a ? getStaticValue(shapes[mi].a, 0) : 0;
            if (Array.isArray(opAmt)) opAmt = opAmt[0];
            for (var ri3 = 0; ri3 < result.length; ri3++) {
                if (!result[ri3].opAmount) result[ri3].opAmount = opAmt;
            }
        }
    }
    return result;
}

// --- Layer transform from Lottie ks (p, a, s, r) ---
// AE order: T(position) * R(rotation) * S(scale) * T(-anchor) on layer content.
// bakeAnchorIntoPosition=true: single group — bake anchor into position (wrong if R animates).
// bakeAnchorIntoPosition=false: outer group gets T(p)*R*S only; anchor lives on a child pivot.
function getLayerTransform(ks, yFlip, hasParent, compW, compH, scale, bakeAnchorIntoPosition) {
    if (!ks) return { position: [0, 0], scale: [100, 100], rotation: 0 };
    var bakeA = bakeAnchorIntoPosition !== false;
    var p = getSplitPosition(ks);
    if (!p) p = getStaticValue(ks.p, [0, 0, 0]);
    if (!Array.isArray(p)) p = [0, 0, 0];
    var a = getStaticValue(ks.a, [0, 0, 0]);
    if (!Array.isArray(a)) a = [0, 0, 0];
    var s = getStaticValue(ks.s, [100, 100, 100]);
    var rVal = getStaticValue(ks.r, 0);
    var r = Array.isArray(rVal) ? rVal[0] : rVal;
    var sc = scale || 1;

    var lsx = (Array.isArray(s) ? s[0] : s) / 100;
    var lsy = (Array.isArray(s) ? s[1] : s) / 100;
    var px = bakeA ? (p[0] - a[0] * lsx) : p[0];
    var py = bakeA ? (p[1] - a[1] * lsy) : p[1];

    if (!hasParent) {
        px -= compW / 2;
        py -= compH / 2;
    }
    var cavX = sc * px;
    var cavY = sc * (yFlip ? -py : py);
    var cavR = yFlip ? -r : r;

    var oVal = getStaticValue(ks.o, 100);
    if (Array.isArray(oVal)) oVal = oVal[0];

    var skewVal = 0;
    if (ks.sk) {
        skewVal = getStaticValue(ks.sk, 0);
        if (Array.isArray(skewVal)) skewVal = skewVal[0];
    }
    var skewAxis = 0;
    if (ks.sa) {
        skewAxis = getStaticValue(ks.sa, 0);
        if (Array.isArray(skewAxis)) skewAxis = skewAxis[0];
    }

    return {
        position: [cavX, cavY],
        scale: [Array.isArray(s) ? s[0] : s, Array.isArray(s) ? s[1] : s],
        rotation: cavR,
        opacity: oVal,
        skew: skewVal,
        skewAxis: skewAxis
    };
}

function createGroup(name) {
    return api.create("group", name);
}

// Anchor in Lottie layer space; precomp layers use comp-centred anchor adjustment.
function getPivotAnchorForLayer(ks, precompW, precompH) {
    if (!ks) return { ax: 0, ay: 0 };
    var a = getStaticValue(ks.a, [0, 0, 0]);
    var rawAx = Array.isArray(a) ? a[0] : 0;
    var rawAy = Array.isArray(a) ? a[1] : 0;
    var ax = rawAx;
    var ay = rawAy;
    if (precompW > 0 && precompH > 0) {
        ax = rawAx - precompW / 2;
        ay = rawAy - precompH / 2;
    }
    return { ax: ax, ay: ay };
}

// Outer = T(p)*R*S, inner = T(-anchor) so world matches AE when R animates.
function buildLayerTransformRig(contentNodeId, layer, entry) {
    if (!contentNodeId || !layer) return { xform: contentNodeId, pivot: contentNodeId };
    // compositionReference layers: keep a single transform node with baked anchor.
    // The pivot rig + precomp centre bump are tuned together for shape layers; applying
    // both to nested comps mis-places instances in parent comps (e.g. characters off-screen
    // in main while inner precomp looks correct). Limb rotation is authored on shape
    // layers inside the precomp, not on the precomp instance transform.
    if (entry && entry.kind === "precomp") {
        return { xform: contentNodeId, pivot: contentNodeId };
    }
    var pa = getPivotAnchorForLayer(layer.ks, 0, 0);
    if (!layer.ks || (Math.abs(pa.ax) < 0.0001 && Math.abs(pa.ay) < 0.0001)) {
        return { xform: contentNodeId, pivot: contentNodeId };
    }
    var nm = layer.nm || "Layer";
    var xformId;
    var pivotId;
    try {
        xformId = createGroup(nm);
        pivotId = createGroup(nm + " [pivot]");
        api.parent(pivotId, xformId);
        api.parent(contentNodeId, pivotId);
    } catch (e) {
        return { xform: contentNodeId, pivot: contentNodeId };
    }
    return { xform: xformId, pivot: pivotId };
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
        if (!lkf) continue;
        if (lkf.h === 1) continue;
        if (!lkf.o) continue;
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

// Temporal easing for path/mask inputPath keyframes. Cavalry path keyframes use numValue
// aligned with frame; use value === frame so Lottie bezier y scales like applyLottieEasing.
function applyPathEasing(nodeId, attr, lottieKfs, timeOffset) {
    if (!nodeId || !attr || !lottieKfs || lottieKfs.length < 2) return;
    var tOff = timeOffset || 0;
    var cavalryKfs = [];
    for (var i = 0; i < lottieKfs.length; i++) {
        var lk = lottieKfs[i];
        var fr = (lk.t != null ? lk.t : 0) + tOff;
        cavalryKfs.push({ frame: fr, value: fr });
    }
    applyLottieEasing(nodeId, attr, cavalryKfs, lottieKfs, 0);
}

// --- Keyframe animated transforms (p, s, r) ---
// precompDims: optional {w, h} for compositionReference layers. When provided,
// the anchor used for scale-position compensation is shifted by [-w/2, -h/2]
// so the precomp center tracks correctly as scale changes.
// parentPrecompDims: optional {w, h} when the layer is parented to a
// compositionReference — adds the parent comp center to centX/centY so
// position keyframes are correctly relative to the parent comp center.
// anchorOnPivot: true when T(-anchor) is on a child pivot — do not fold anchor
// into position keyframes or scale-driven position compensation (parent S handles it).
// skipOpacity: true for null/proxy groups — AE null opacity does not affect children;
// Cavalry group opacity would cascade and hide descendants.
function keyframeAnimatedTransforms(nodeId, ks, yFlip, hasParent, compW, compH, scaleFactor, timeOffset, precompDims, parentPrecompDims, anchorOnPivot, skipOpacity) {
    if (!ks) return;
    var tOff = timeOffset || 0;
    var sc = scaleFactor || 1;
    var a = getStaticValue(ks.a, [0, 0, 0]);
    var rawAx = Array.isArray(a) ? a[0] : 0;
    var rawAy = Array.isArray(a) ? a[1] : 0;
    var ax = precompDims ? (rawAx - precompDims.w / 2) : rawAx;
    var ay = precompDims ? (rawAy - precompDims.h / 2) : rawAy;
    if (anchorOnPivot) {
        ax = 0;
        ay = 0;
    }
    var centX = hasParent ? 0 : compW / 2;
    var centY = hasParent ? 0 : compH / 2;
    if (parentPrecompDims) {
        centX += parentPrecompDims.w / 2;
        centY += parentPrecompDims.h / 2;
    }
    var posAnimated = false;

    // Static scale for anchor baking in position keyframes
    var sStatic = getStaticValue(ks.s, [100, 100, 100]);
    var sSx = (Array.isArray(sStatic) ? sStatic[0] : sStatic) / 100;
    var sSy = (Array.isArray(sStatic) ? sStatic[1] : sStatic) / 100;

    // Get static position for anchor-scale compensation
    var sp = getSplitPosition(ks);
    if (!sp) sp = getStaticValue(ks.p, [0, 0, 0]);
    if (!Array.isArray(sp)) sp = [0, 0, 0];
    var staticPosX = sp[0];
    var staticPosY = sp[1];

    if (ks.p && ks.p.s === true) {
        var pxProp = ks.p.x;
        var pyProp = ks.p.y;
        if (pxProp && pxProp.k && ((pxProp.a === 1) || (pxProp.k.length > 1 && isLottieKeyframeStyleArray(pxProp.k) && pxProp.a !== 1))) {
            posAnimated = true;
            var pxKfs = [];
            for (var kpi = 0; kpi < pxProp.k.length; kpi++) {
                var kpx = pxProp.k[kpi];
                var frame = (kpx.t != null ? kpx.t : 0) + tOff;
                var vx = Array.isArray(kpx.s) ? kpx.s[0] : kpx.s;
                if (vx == null) continue;
                var px = sc * (vx - ax * sSx - centX);
                try {
                    api.keyframe(nodeId, frame, { "position.x": px });
                    pxKfs.push({ frame: frame, value: px });
                } catch (e) {}
            }
            applyLottieEasing(nodeId, "position.x", pxKfs, pxProp.k, 0);
        }
        if (pyProp && pyProp.k && ((pyProp.a === 1) || (pyProp.k.length > 1 && isLottieKeyframeStyleArray(pyProp.k) && pyProp.a !== 1))) {
            posAnimated = true;
            var pyKfs = [];
            for (var kpi2 = 0; kpi2 < pyProp.k.length; kpi2++) {
                var kpy = pyProp.k[kpi2];
                var frame = (kpy.t != null ? kpy.t : 0) + tOff;
                var vy = Array.isArray(kpy.s) ? kpy.s[0] : kpy.s;
                if (vy == null) continue;
                var py = sc * (yFlip ? -(vy - ay * sSy - centY) : (vy - ay * sSy - centY));
                try {
                    api.keyframe(nodeId, frame, { "position.y": py });
                    pyKfs.push({ frame: frame, value: py });
                } catch (e) {}
            }
            applyLottieEasing(nodeId, "position.y", pyKfs, pyProp.k, 0);
        }
    } else if (ks.p && ks.p.k && ks.p.k.length > 1 && (ks.p.a === 1 || (isLottieKeyframeStyleArray(ks.p.k) && ks.p.a !== 1))) {
        posAnimated = true;
        var posXKfs = [];
        var posYKfs = [];
        for (var kp = 0; kp < ks.p.k.length; kp++) {
            var kpv = ks.p.k[kp];
            var frame = (kpv.t != null ? kpv.t : 0) + tOff;
            var v = kpv.s || kpv.k;
            if (!Array.isArray(v)) continue;
            var px = sc * (v[0] - ax * sSx - centX);
            var py = sc * (yFlip ? -(v[1] - ay * sSy - centY) : (v[1] - ay * sSy - centY));
            try {
                api.keyframe(nodeId, frame, { "position.x": px, "position.y": py });
                posXKfs.push({ frame: frame, value: px });
                posYKfs.push({ frame: frame, value: py });
            } catch (e) {}
        }
        applyLottieEasing(nodeId, "position.x", posXKfs, ks.p.k, 0);
        applyLottieEasing(nodeId, "position.y", posYKfs, ks.p.k, 1);
    }

    if (ks.s && ks.s.k && ks.s.k.length > 1 && (ks.s.a === 1 || (isLottieKeyframeStyleArray(ks.s.k) && ks.s.a !== 1))) {
        var scaleXKfs = [];
        var scaleYKfs = [];

        // When scale is animated and anchor is non-zero, the position must
        // compensate: effectivePos = pos - anchor * (scale/100). Keyframe
        // position at each scale keyframe to maintain the correct anchor pivot.
        var needsAnchorComp = !anchorOnPivot && !posAnimated && (Math.abs(ax) > 0.001 || Math.abs(ay) > 0.001);
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

    if (ks.r && ks.r.k && ks.r.k.length > 1 && (ks.r.a === 1 || (isLottieKeyframeStyleArray(ks.r.k) && ks.r.a !== 1))) {
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

    if (!skipOpacity && ks.o && ks.o.k && ks.o.k.length > 1 && (ks.o.a === 1 || (isLottieKeyframeStyleArray(ks.o.k) && ks.o.a !== 1))) {
        var opKfs = [];
        for (var ko = 0; ko < ks.o.k.length; ko++) {
            var kov = ks.o.k[ko];
            var frame = (kov.t != null ? kov.t : 0) + tOff;
            var oRaw = kov.s !== undefined ? kov.s : kov.k;
            var oVal = Array.isArray(oRaw) ? oRaw[0] : oRaw;
            if (oVal == null) continue;
            try {
                api.keyframe(nodeId, frame, { "opacity": oVal });
                opKfs.push({ frame: frame, value: oVal });
            } catch (e) {}
        }
        applyLottieEasing(nodeId, "opacity", opKfs, ks.o.k, 0);
    }
}

// --- Keyframe a single numeric Lottie property ---
function keyframeSingleValue(nodeId, attrName, ks, timeOffset) {
    if (!singleValuePropIsAnimated(ks)) return;
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
    var trimProps = {
        "stroke.trim": 1,
        "stroke.trimStart": trimInfo.start,
        "stroke.trimEnd": trimInfo.end
    };
    if (trimInfo.offset) {
        trimProps["stroke.trimTravel"] = (trimInfo.offset / 360) * 100;
    }
    api.set(nodeId, trimProps);
    if (trimInfo.startKs) keyframeSingleValue(nodeId, "stroke.trimStart", trimInfo.startKs, tOff);
    if (trimInfo.endKs) keyframeSingleValue(nodeId, "stroke.trimEnd", trimInfo.endKs, tOff);
    if (trimInfo.offsetKs) keyframeTrimTravel(nodeId, trimInfo.offsetKs, tOff);
}

// Keyframe trim travel converting 0-360 degrees to 0-100 percent
function keyframeTrimTravel(nodeId, ks, timeOffset) {
    if (!singleValuePropIsAnimated(ks)) return;
    var tOff = timeOffset || 0;
    var kfs = [];
    for (var ki = 0; ki < ks.k.length; ki++) {
        var kv = ks.k[ki];
        var frame = (kv.t != null ? kv.t : 0) + tOff;
        var val = kv.s !== undefined ? kv.s : kv.k;
        if (Array.isArray(val)) val = val[0];
        if (val === undefined) continue;
        var travel = (val / 360) * 100;
        try {
            api.keyframe(nodeId, frame, { "stroke.trimTravel": travel });
            kfs.push({ frame: frame, value: travel });
        } catch (e) {}
    }
    applyLottieEasing(nodeId, "stroke.trimTravel", kfs, ks.k, 0);
}

// --- Animate shape path keyframes ---
function animateShapePath(shapeId, pathKs, yFlip, scaleFactor, groupOffset, timeOffset) {
    if (!pathKs || !pathKsIsAnimated(pathKs)) return;
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
    if (applied >= 2) applyPathEasing(shapeId, "inputPath", pathKs.k, tOff);
}

// Get path data from an animated ks at a specific Lottie time.
// Returns the start value of the keyframe at or just before the target time.
function getPathDataAtTime(ks, time) {
    if (!ks || !ks.k || ks.k.length === 0 || !pathKsIsAnimated(ks)) return null;
    var bestIdx = 0;
    for (var i = 0; i < ks.k.length; i++) {
        var t = ks.k[i].t != null ? ks.k[i].t : 0;
        if (t <= time) bestIdx = i;
        else break;
    }
    return getPathDataAtKeyframe(ks, bestIdx);
}

// --- Animate compound shape (multi-contour) path keyframes ---
// Collects all keyframe times across sub-paths, builds a combined
// multi-contour inputPath at each time, and keyframes the shape.
function animateCompoundShapePaths(shapeId, compoundPaths, yFlip, scaleFactor, timeOffset) {
    var anyAnimated = false;
    for (var i = 0; i < compoundPaths.length; i++) {
        var ks = compoundPaths[i].pathKs;
        if (pathKsIsAnimated(ks)) {
            anyAnimated = true;
            break;
        }
    }
    if (!anyAnimated) return;

    var tOff = timeOffset || 0;
    var allTimes = [];
    var timeSet = {};
    for (var i = 0; i < compoundPaths.length; i++) {
        var ks = compoundPaths[i].pathKs;
        if (!ks || !ks.k || !pathKsIsAnimated(ks)) continue;
        for (var j = 0; j < ks.k.length; j++) {
            var t = ks.k[j].t != null ? ks.k[j].t : 0;
            if (!timeSet[t]) {
                timeSet[t] = true;
                allTimes.push(t);
            }
        }
    }
    allTimes.sort(function(a, b) { return a - b; });

    var applied = 0;
    for (var ti = 0; ti < allTimes.length; ti++) {
        var t = allTimes[ti];
        var contours = [];
        var valid = true;

        for (var ci = 0; ci < compoundPaths.length; ci++) {
            var cp = compoundPaths[ci];
            var pathData;
            if (pathKsIsAnimated(cp.pathKs)) {
                pathData = getPathDataAtTime(cp.pathKs, t);
            } else {
                pathData = cp.pathData;
            }
            var contour = lottiePathToSingleContour(pathData, yFlip, scaleFactor, cp.groupOffset);
            if (!contour) { valid = false; break; }
            contours.push(contour);
        }
        if (!valid || contours.length === 0) continue;

        var frame = t + tOff;
        try {
            api.keyframe(shapeId, frame, { "inputPath": { contours: contours, fillType: 0, version: 1 } });
            applied++;
        } catch (err) {
            if (applied === 0) console.log("Lottie Importer: Compound path keyframes failed: " + err.message);
            break;
        }
    }
    if (applied > 0) console.log("Lottie Importer: Applied " + applied + " compound shape keyframes");
    if (applied >= 2) {
        var easeKs = null;
        for (var ei = 0; ei < compoundPaths.length; ei++) {
            var ePath = compoundPaths[ei].pathKs;
            if (pathKsIsAnimated(ePath)) {
                easeKs = ePath.k;
                break;
            }
        }
        if (easeKs) applyPathEasing(shapeId, "inputPath", easeKs, tOff);
    }
}

// Cavalry clipping mask mode enum:
//   0 = Union, 1 = Subtract, 2 = Intersect, 3 = Difference
//
// AE/lottie-web evaluate masks sequentially. The first Add defines the initial
// visible region (clip-to-shape -> Intersect). Later Adds union more area.
// With nested groups each shape gets exactly one mask, so isFirstMask distinguishes
// the innermost clip from subsequent wrappers.
function lottieMaskModeToCavalry(mode, isFirstMask) {
    if (mode === "a") return isFirstMask ? 2 : 0; // first Add -> Intersect; later -> Union
    if (mode === "s") return 1;
    if (mode === "i") return 2;
    if (mode === "f") return 3;
    return 0;
}

// Mask opacity 0–100 (Lottie) -> shape opacity for hidden mask geometry.
function applyMaskOpacityFromLottie(maskId, maskO, timeOffset) {
    if (!maskId || !maskO) return;
    var tOff = timeOffset || 0;
    if (!singleValuePropIsAnimated(maskO)) {
        var v = getStaticValue(maskO, 100);
        if (Array.isArray(v)) v = v[0];
        if (typeof v !== "number") return;
        try { api.set(maskId, { "opacity": v / 100 }); } catch (e) {
            try { api.set(maskId, { "opacity": v }); } catch (e2) {}
        }
        return;
    }
    var kfs = [];
    for (var i = 0; i < maskO.k.length; i++) {
        var kv = maskO.k[i];
        var frame = (kv.t != null ? kv.t : 0) + tOff;
        var val = kv.s !== undefined ? kv.s : 100;
        if (Array.isArray(val)) val = val[0];
        var scaled = val / 100;
        try {
            api.keyframe(maskId, frame, { "opacity": scaled });
            kfs.push({ frame: frame, value: scaled });
        } catch (e) {}
    }
    applyLottieEasing(maskId, "opacity", kfs, maskO.k, 0);
}

// Invert / opacity / expansion — best-effort; Cavalry API paths vary by version.
function tryApplyLottieMaskExtras(mask, maskId, tgt, maskSlotIdx, timeOffset) {
    if (mask.inv === true) {
        try {
            var invA = {};
            invA["masks." + maskSlotIdx + ".compound.inverted"] = true;
            api.set(tgt, invA);
        } catch (e0) {
            try {
                var invB = {};
                invB["masks." + maskSlotIdx + ".inverted"] = true;
                api.set(tgt, invB);
            } catch (e1) {}
        }
    }
    if (mask.o) applyMaskOpacityFromLottie(maskId, mask.o, timeOffset);
    if (mask.x) {
        var xVal = getStaticValue(mask.x, 0);
        var xNum = typeof xVal === "number" ? xVal : 0;
        var xAnim = mask.x.k && mask.x.k.length > 1 && (mask.x.a === 1 || (isLottieKeyframeStyleArray(mask.x.k) && mask.x.a !== 1));
        if (Math.abs(xNum) > 0.01 || xAnim) {
            if (!_lottieMaskPropsUnsupportedLogged) {
                _lottieMaskPropsUnsupportedLogged = true;
                console.log("Lottie Importer: Mask expansion (x) is not applied; results may differ from AE/lottie-web.");
            }
        }
    }
}

// Create a single mask shape node (hidden, parented, with keyframes + easing).
function createSingleMaskShape(maskData, label, yFlip, scaleFactor, maskOff, parentId, tOff) {
    var pt = maskData.pt;
    if (!pt) return null;
    var pathData = getPathDataFromShapeKs(pt);
    if (!pathData) return null;
    var path = lottiePathToCavalryPath(pathData, yFlip, scaleFactor, maskOff);
    if (!path) return null;
    var maskId;
    try {
        maskId = api.createEditable(path, label);
    } catch (e) { return null; }
    api.set(maskId, { "hidden": true });
    try { api.parent(maskId, parentId); } catch (e) {}
    if (pathKsIsAnimated(pt)) {
        var maskKfCount = 0;
        for (var kf = 0; kf < pt.k.length; kf++) {
            var kfData = getPathDataAtKeyframe(pt, kf);
            if (!kfData) continue;
            var frame = getKeyframeTime(pt, kf) + tOff;
            var contour = lottiePathToContourData(kfData, yFlip, scaleFactor, maskOff);
            if (!contour) continue;
            try {
                api.keyframe(maskId, frame, { "inputPath": contour });
                maskKfCount++;
            } catch (e) {
                console.log("Lottie Importer: Mask keyframe failed at frame " + frame + ": " + e.message);
            }
        }
        if (maskKfCount > 0) {
            applyPathEasing(maskId, "inputPath", pt.k, tOff);
        }
    }
    return maskId;
}

// Create a compound mask shape (multi-contour) from several mask entries.
// entries: array of { mask: maskData, origIndex: number }
function createCompoundMaskShape(entries, label, yFlip, scaleFactor, maskOff, parentId, tOff) {
    var combinedPath = new cavalry.Path();
    var compPaths = [];
    for (var i = 0; i < entries.length; i++) {
        var pd = getPathDataFromShapeKs(entries[i].mask.pt);
        if (!pd) continue;
        appendLottiePathToCavalryPath(combinedPath, pd, yFlip, scaleFactor, maskOff);
        compPaths.push({ pathKs: entries[i].mask.pt, pathData: pd, groupOffset: maskOff });
    }
    if (compPaths.length === 0) return null;
    var maskId;
    try {
        maskId = api.createEditable(combinedPath, label);
    } catch (e) { return null; }
    api.set(maskId, { "hidden": true });
    try { api.parent(maskId, parentId); } catch (e) {}
    animateCompoundShapePaths(maskId, compPaths, yFlip, scaleFactor, tOff);
    return maskId;
}

// Connect a single mask shape to a target node at masks.0 with the given mode.
function connectSingleMask(maskId, tgt, cavMaskMode, maskData, tOff) {
    try {
        api.addArrayIndex(tgt, "masks");
        api.connect(maskId, "id", tgt, "masks.0.id");
        api.set(tgt, { "masks.0.mode": cavMaskMode });
        if (maskData) tryApplyLottieMaskExtras(maskData, maskId, tgt, 0, tOff);
    } catch (e) {
        console.log("Lottie Importer: Mask connect failed: " + e.message);
    }
}

// --- Apply Lottie masks as Cavalry clipping masks ---
// Reference: lottie-web `player/js/mask.js` — masks are evaluated sequentially.
//
// Cavalry's multi-mask-per-shape feature is unreliable, so we avoid it entirely.
// Strategy: consecutive Add ("a") masks are merged into a single compound editable
// shape (multi-contour) and applied as one Intersect mask — this faithfully
// reproduces the union of Add regions. Non-Add masks (Subtract, Intersect,
// Difference) each get a nested wrapper group around the target, so every node
// only ever has ONE clipping mask connected.
//
// When the first effective mask is subtract ('s') or intersect ('i'), lottie-web
// prepends a full-comp white rect; we merge it into the first Add compound.
//
// precompDims: optional {w, h} — shifts mask coords by [-w/2,-h/2] and provides
//   synthetic base rect size for inner comps.
// maskBounds: optional {w, h} — comp size when precompDims is null; used for
//   synthetic base rect.
function applyMasks(layer, targetIds, yFlip, scaleFactor, nodeId, timeOffset, maskIndexByTarget, precompDims, maskBounds) {
    var masks = layer.masksProperties;
    if (!masks || !targetIds || targetIds.length === 0) return;
    var tOff = timeOffset || 0;
    var maskOff = precompDims ? [-precompDims.w / 2, -precompDims.h / 2] : [0, 0];

    // Collect effective masks (skip "n" and missing pt)
    var effective = [];
    for (var em = 0; em < masks.length; em++) {
        var emk = masks[em];
        if (emk.mode === "n") continue;
        if (!emk.pt) continue;
        if (!getPathDataFromShapeKs(emk.pt)) continue;
        effective.push({ mask: emk, origIndex: em });
    }
    if (effective.length === 0) return;

    // If first effective mask is s or i, prepend a synthetic "a" base rect
    var firstMode = effective[0].mask.mode;
    var needsBase = (firstMode === "s" || firstMode === "i");
    if (needsBase) {
        var baseW = 0, baseH = 0;
        if (precompDims && precompDims.w > 0 && precompDims.h > 0) {
            baseW = precompDims.w; baseH = precompDims.h;
        } else if (maskBounds && maskBounds.w > 0 && maskBounds.h > 0) {
            baseW = maskBounds.w; baseH = maskBounds.h;
        }
        if (baseW > 0 && baseH > 0) {
            var basePd = buildFullCompMaskPathData(baseW, baseH);
            effective.unshift({
                mask: { mode: "a", pt: { a: 0, k: basePd } },
                origIndex: -1
            });
        }
    }

    // Group consecutive masks into segments:
    //   "add" segment = one or more consecutive "a" masks → compound shape
    //   "single" segment = one non-"a" mask → individual shape
    var segments = [];
    var curAdds = [];
    for (var si = 0; si < effective.length; si++) {
        if (effective[si].mask.mode === "a") {
            curAdds.push(effective[si]);
        } else {
            if (curAdds.length > 0) {
                segments.push({ type: "add", entries: curAdds });
                curAdds = [];
            }
            segments.push({ type: "single", entry: effective[si] });
        }
    }
    if (curAdds.length > 0) segments.push({ type: "add", entries: curAdds });
    if (segments.length === 0) return;

    // Pre-create mask shape nodes (shared across all targets)
    var segShapeIds = [];
    for (var sg = 0; sg < segments.length; sg++) {
        var seg = segments[sg];
        var shapeId = null;
        if (seg.type === "add") {
            var indices = [];
            for (var ai = 0; ai < seg.entries.length; ai++) indices.push(seg.entries[ai].origIndex);
            var label = "Mask Add [" + indices.join(",") + "]";
            if (seg.entries.length === 1) {
                shapeId = createSingleMaskShape(seg.entries[0].mask, label, yFlip, scaleFactor, maskOff, nodeId, tOff);
            } else {
                shapeId = createCompoundMaskShape(seg.entries, label, yFlip, scaleFactor, maskOff, nodeId, tOff);
            }
        } else {
            var sLabel = "Mask " + seg.entry.origIndex;
            shapeId = createSingleMaskShape(seg.entry.mask, sLabel, yFlip, scaleFactor, maskOff, nodeId, tOff);
        }
        segShapeIds.push(shapeId);
    }

    // Determine if we can skip wrapping (single segment, no nesting needed)
    var singleSegment = (segments.length === 1);

    for (var ti = 0; ti < targetIds.length; ti++) {
        var currentNode = targetIds[ti];

        if (singleSegment && segShapeIds[0]) {
            // One segment only — connect directly to the target, no wrapper
            var seg0 = segments[0];
            var mode0 = lottieMaskModeToCavalry(seg0.type === "add" ? "a" : seg0.entry.mask.mode, true);
            connectSingleMask(segShapeIds[0], currentNode, mode0,
                seg0.type === "add" ? seg0.entries[0].mask : seg0.entry.mask, tOff);
            console.log("Lottie Importer: Direct mask -> " + currentNode + " (cav mode " + mode0 + ")");
            continue;
        }

        // Multiple segments: nest inside-out. Segment 0 is innermost (first eval).
        for (var wi = 0; wi < segments.length; wi++) {
            var mShapeId = segShapeIds[wi];
            if (!mShapeId) continue;
            var wseg = segments[wi];
            var isFirst = (wi === 0);
            var wMode;
            if (wseg.type === "add") {
                wMode = lottieMaskModeToCavalry("a", isFirst);
            } else {
                wMode = lottieMaskModeToCavalry(wseg.entry.mask.mode, isFirst);
            }

            var wrapper;
            try {
                wrapper = createGroup("Mask wrapper " + wi);
            } catch (e) { continue; }
            try { api.parent(currentNode, wrapper); } catch (e) {}
            connectSingleMask(mShapeId, wrapper, wMode,
                wseg.type === "add" ? wseg.entries[0].mask : wseg.entry.mask, tOff);
            console.log("Lottie Importer: Mask segment " + wi + " (cav mode " + wMode + ") nested wrapper " + wrapper);
            currentNode = wrapper;
        }

        // Outermost wrapper takes the target's original place in the hierarchy
        try { api.parent(currentNode, nodeId); } catch (e) {}
    }
}

// --- Keyframe an animated Lottie color property (RGB array keyframes) ---
function keyframeColorProperty(nodeId, attrName, ks, timeOffset) {
    if (!ks || ks.a !== 1 || !ks.k || ks.k.length <= 1) return;
    var tOff = timeOffset || 0;
    for (var ki = 0; ki < ks.k.length; ki++) {
        var kv = ks.k[ki];
        var frame = (kv.t != null ? kv.t : 0) + tOff;
        var val = kv.s;
        if (!Array.isArray(val) || val.length < 3) continue;
        var hex = "#" + [val[0], val[1], val[2]].map(function(x) {
            var n = Math.round(Math.max(0, Math.min(1, x)) * 255);
            return (n < 16 ? "0" : "") + n.toString(16);
        }).join("");
        var obj = {};
        obj[attrName] = hex;
        try { api.keyframe(nodeId, frame, obj); } catch (e) {}
    }
}

// --- Apply stroke properties (cap, join, miter, dash) to a shape node ---
function applyStrokeProperties(nodeId, strokeInfo, scaleFactor) {
    if (!strokeInfo) return;
    var capMap = { 1: 0, 2: 1, 3: 2 };
    var joinMap = { 1: 0, 2: 1, 3: 2 };
    var props = {};
    if (strokeInfo.lineCap && capMap[strokeInfo.lineCap] !== undefined) {
        props["stroke.capStyle"] = capMap[strokeInfo.lineCap];
    }
    if (strokeInfo.lineJoin && joinMap[strokeInfo.lineJoin] !== undefined) {
        props["stroke.joinStyle"] = joinMap[strokeInfo.lineJoin];
    }
    try { api.set(nodeId, props); } catch (e) {}
    if (strokeInfo.dashes) {
        var dashVal = 0, gapVal = 0, offsetVal = 0;
        for (var di = 0; di < strokeInfo.dashes.length; di++) {
            var de = strokeInfo.dashes[di];
            if (de.n === "d") dashVal = de.v * scaleFactor;
            else if (de.n === "g") gapVal = de.v * scaleFactor;
            else if (de.n === "o") offsetVal = de.v * scaleFactor;
        }
        if (dashVal > 0) {
            try {
                api.set(nodeId, {
                    "stroke.dash": 1,
                    "stroke.dashLength": dashVal,
                    "stroke.gapLength": gapVal || dashVal,
                    "stroke.dashOffset": offsetVal
                });
            } catch (e) {}
        }
    }
}

// --- Create a PolyStar shape (star or polygon primitive) ---
function createPolyStar(psItem, name, yFlip, scaleFactor, groupOffset, compW, compH) {
    var sy = psItem.sy || 1;
    var ptVal = getStaticValue(psItem.pt, 5);
    if (Array.isArray(ptVal)) ptVal = ptVal[0];
    var orVal = getStaticValue(psItem.or, 50);
    if (Array.isArray(orVal)) orVal = orVal[0];
    var posVal = getStaticValue(psItem.p, [0, 0]);
    var px = (Array.isArray(posVal) ? posVal[0] : 0) + (groupOffset ? groupOffset[0] : 0);
    var py = (Array.isArray(posVal) ? posVal[1] : 0) + (groupOffset ? groupOffset[1] : 0);
    var rVal = getStaticValue(psItem.r, 0);
    if (Array.isArray(rVal)) rVal = rVal[0];
    var nodeId;
    if (sy === 2) {
        nodeId = api.primitive("polygon", name);
        api.set(nodeId, {
            "generator.sides": Math.round(ptVal),
            "generator.radius": orVal * scaleFactor
        });
    } else {
        nodeId = api.primitive("star", name);
        var irVal = getStaticValue(psItem.ir, 25);
        if (Array.isArray(irVal)) irVal = irVal[0];
        api.set(nodeId, {
            "generator.points": Math.round(ptVal),
            "generator.outerRadius": orVal * scaleFactor,
            "generator.innerRadius": irVal * scaleFactor
        });
    }
    var cavX = scaleFactor * px;
    var cavY = scaleFactor * (yFlip ? -py : py);
    api.set(nodeId, {
        "position.x": cavX,
        "position.y": cavY,
        "rotation.z": yFlip ? -rVal : rVal
    });
    return nodeId;
}

// --- Apply fill/stroke/opacity to a shape from collected shape data ---
function lottieFillRuleToCavalry(lottieFillRule, isCompound) {
    if (lottieFillRule === 2) return 0;
    if (lottieFillRule === 1) return 1;
    return isCompound ? 0 : 1;
}

function applyShapeStyle(nodeId, shapeData, scaleFactor, tOff, yFlip) {
    var goff = shapeData.groupOffset || [0, 0];
    if (shapeData.hasFill) {
        api.setFill(nodeId, true);
        api.set(nodeId, { "fillRule": lottieFillRuleToCavalry(shapeData.lottieFillRule, shapeData.isCompound) });
        if (shapeData.gradientInfo) {
            applyGradientFill(nodeId, shapeData.gradientInfo, scaleFactor, yFlip, goff);
        } else {
            api.set(nodeId, { "material.materialColor": shapeData.fillColor });
        }
    } else {
        api.setFill(nodeId, false);
    }
    if (shapeData.strokeInfo) {
        api.setStroke(nodeId, true);
        api.set(nodeId, {
            "stroke.strokeColor": shapeData.strokeInfo.color,
            "stroke.width": shapeData.strokeInfo.width * scaleFactor
        });
        applyStrokeProperties(nodeId, shapeData.strokeInfo, scaleFactor);
        if (shapeData.strokeInfo.opacity != null && shapeData.strokeInfo.opacity < 100) {
            try { api.set(nodeId, { "stroke.strokeColor.a": Math.round(shapeData.strokeInfo.opacity * 2.55) }); } catch (e) {}
        }
        if (shapeData.strokeInfo.colorKs) keyframeColorProperty(nodeId, "stroke.strokeColor", shapeData.strokeInfo.colorKs, tOff);
        if (shapeData.strokeInfo.widthKs) keyframeSingleValue(nodeId, "stroke.width", shapeData.strokeInfo.widthKs, tOff);
        if (shapeData.strokeInfo.gradientInfo) {
            applyGradientFill(nodeId, shapeData.strokeInfo.gradientInfo, scaleFactor, yFlip, goff);
        }
    }
    applyTrimPath(nodeId, shapeData.trimInfo, tOff);
    // Group opacity
    var effectiveOpacity = 100;
    if (shapeData.groupOpacity != null && shapeData.groupOpacity < 100) effectiveOpacity = shapeData.groupOpacity;
    if (effectiveOpacity < 100) {
        try { api.set(nodeId, { "opacity": effectiveOpacity }); } catch (e) {}
    }
    // Fill opacity
    if (shapeData.hasFill && shapeData.fillOpacity != null && shapeData.fillOpacity < 100) {
        try { api.set(nodeId, { "material.alpha": shapeData.fillOpacity }); } catch (e) {}
    }
    // Animated fill color
    if (shapeData.fillColorKs) keyframeColorProperty(nodeId, "material.materialColor", shapeData.fillColorKs, tOff);
    // Animated fill opacity
    if (shapeData.fillOpacityKs) keyframeSingleValue(nodeId, "material.alpha", shapeData.fillOpacityKs, tOff);
    // Rounded corners via Bevel deformer
    if (shapeData.rdValue && shapeData.rdValue > 0) {
        try {
            var bevelId = api.create("bevel", "Rounded Corners");
            api.connect(bevelId, "id", nodeId, "deformers");
            api.set(bevelId, { "radius": shapeData.rdValue * scaleFactor });
        } catch (e) {}
    }
    // Offset path deformer
    if (shapeData.opAmount && Math.abs(shapeData.opAmount) > 0.001) {
        try {
            var offsetId = api.create("offsetPath", "Offset Path");
            api.connect(offsetId, "id", nodeId, "deformers");
            api.set(offsetId, { "amount": shapeData.opAmount * scaleFactor });
        } catch (e) {}
    }
}

// --- Create a Solid Layer (ty=1) ---
function createSolidLayer(layer, name, yFlip, scaleFactor, compW, compH, hasParent) {
    var sw = layer.sw || compW;
    var sh = layer.sh || compH;
    var sc = layer.sc || "#000000";
    var nodeId = api.primitive("rectangle", name);
    api.set(nodeId, {
        "generator.dimensions": [sw * scaleFactor, sh * scaleFactor]
    });
    api.setFill(nodeId, true);
    api.set(nodeId, { "material.materialColor": sc });
    return nodeId;
}

// --- Create an Image Layer (ty=2) ---
var lottieAssetGroupId = null;
function createImageLayer(layer, assets, name, yFlip, scaleFactor, compW, compH) {
    var refId = layer.refId || layer.ref;
    if (!refId) return null;
    var asset = null;
    for (var ai = 0; ai < (assets || []).length; ai++) {
        if (assets[ai].id === refId) { asset = assets[ai]; break; }
    }
    if (!asset) return null;
    var imgW = asset.w || layer.sw || 100;
    var imgH = asset.h || layer.sh || 100;
    var nodeId = api.primitive("rectangle", name);
    api.set(nodeId, { "generator.dimensions": [imgW * scaleFactor, imgH * scaleFactor] });
    var b64Data = null;
    var ext = "png";
    if (asset.e === 1 && asset.p) {
        var m = /^data:([^;]+);base64,(.*)$/i.exec(asset.p);
        if (m) {
            var mime = m[1].toLowerCase();
            b64Data = m[2];
            if (mime.indexOf("jpeg") !== -1 || mime.indexOf("jpg") !== -1) ext = "jpg";
            else if (mime.indexOf("png") !== -1) ext = "png";
            else if (mime.indexOf("webp") !== -1) ext = "webp";
        }
    }
    if (b64Data) {
        try {
            var assetsPath = api.getAssetPath ? api.getAssetPath() : null;
            if (assetsPath) {
                var lottieFolderPath = assetsPath + "/Lottie";
                try { if (api.ensureDirectory) api.ensureDirectory(lottieFolderPath); } catch (e) {}
                var filePath = lottieFolderPath + "/" + (asset.id || "img") + "." + ext;
                if (api.writeEncodedToBinaryFile) {
                    api.writeEncodedToBinaryFile(filePath, b64Data);
                    var fileAssetId = null;
                    try { fileAssetId = api.loadAsset(filePath, false); } catch (e) {}
                    if (!fileAssetId) { try { fileAssetId = api.importAsset(filePath); } catch (e) {} }
                    if (fileAssetId) {
                        var shaderId = api.create("imageShader", name + " Shader");
                        try { api.connect(fileAssetId, "id", shaderId, "asset"); } catch (e) {}
                        api.addArrayIndex(nodeId, "material.colorShaders");
                        api.connect(shaderId, "id", nodeId, "material.colorShaders.0.shader");
                        if (!lottieAssetGroupId) {
                            try { lottieAssetGroupId = api.createAssetGroup("Lottie Assets"); } catch (e) {}
                        }
                        if (lottieAssetGroupId && fileAssetId) {
                            try { api.parent(fileAssetId, lottieAssetGroupId); } catch (e) {}
                        }
                    }
                }
            }
        } catch (e) {
            console.log("Lottie Importer: Image decode failed: " + e.message);
        }
    }
    return nodeId;
}

// --- Create a Text Layer (ty=5) ---
function createTextLayer(layer, name, yFlip, scaleFactor, compW, compH) {
    var textData = layer.t;
    if (!textData || !textData.d || !textData.d.k || textData.d.k.length === 0) return null;
    var doc = textData.d.k[0].s || textData.d.k[0];
    if (!doc) return null;
    var textString = doc.t || "";
    if (!textString) return null;
    var fontSize = (doc.s || 16) * scaleFactor;
    var fontFamily = doc.f || "Arial";
    var justification = doc.j || 0;
    var hAlignMap = { 0: 0, 1: 1, 2: 2, 3: 3 };
    var hAlign = hAlignMap[justification] || 0;
    var nodeId = api.create("textShape", name);
    var textProps = {
        "text": textString,
        "fontSize": fontSize,
        "font.font": fontFamily,
        "horizontalAlignment": hAlign,
        "verticalAlignment": 0
    };
    api.set(nodeId, textProps);
    if (doc.fc && Array.isArray(doc.fc) && doc.fc.length >= 3) {
        var hex = "#" + [doc.fc[0], doc.fc[1], doc.fc[2]].map(function(x) {
            var n = Math.round(Math.max(0, Math.min(1, x)) * 255);
            return (n < 16 ? "0" : "") + n.toString(16);
        }).join("");
        api.set(nodeId, { "material.materialColor": hex });
    }
    if (doc.lh) {
        try { api.set(nodeId, { "lineSpacing": (doc.lh - fontSize * 1.29) }); } catch (e) {}
    }
    if (doc.ls) {
        try { api.set(nodeId, { "letterSpacing": doc.ls * scaleFactor }); } catch (e) {}
    }
    if (doc.sc && Array.isArray(doc.sc) && doc.sc.length >= 3 && doc.sw) {
        var sHex = "#" + [doc.sc[0], doc.sc[1], doc.sc[2]].map(function(x) {
            var n = Math.round(Math.max(0, Math.min(1, x)) * 255);
            return (n < 16 ? "0" : "") + n.toString(16);
        }).join("");
        try {
            api.setStroke(nodeId, true);
            api.set(nodeId, {
                "stroke.strokeColor": sHex,
                "stroke.width": (doc.sw || 1) * scaleFactor
            });
        } catch (e) {}
    }
    return nodeId;
}

// True precomp composition size for transform math (anchor bake, comp center).
// 1) Prefer asset.w/h when present.
// 2) If missing: some exports omit asset size but set layer.w/h to the *source*
//    comp (e.g. 3840) while root is tiny (140) — use layer dims when either
//    side is larger than the parent comp (CanvaLogo_Gradient).
// 3) If layer.w/h are both smaller than parent (timeline proxy box 400x500 in
//    a 1200 comp), inner ks usually lives in parent space — inherit parent
//    (website-building-of-shopping-sale).
function resolvePrecompSourceDims(layer, asset, parentCompW, parentCompH) {
    var pw = (parentCompW != null && parentCompW > 0) ? parentCompW : 1920;
    var ph = (parentCompH != null && parentCompH > 0) ? parentCompH : 1080;
    if (asset && asset.w > 0 && asset.h > 0) {
        return { w: asset.w, h: asset.h };
    }
    var lw = layer.w;
    var lh = layer.h;
    if (lw > 0 && lh > 0 && (lw > pw || lh > ph)) {
        return { w: lw, h: lh };
    }
    return { w: pw, h: ph };
}

function findAssetById(assets, refId) {
    if (!assets || !refId) return null;
    for (var fi = 0; fi < assets.length; fi++) {
        if (assets[fi].id === refId) return assets[fi];
    }
    return null;
}

// Import a set of layers (from a precomp or root), returning created Cavalry IDs.
// groupId: if provided, top-level layers are parented to this group and all
// layers are treated as having a parent (no root-comp centering on positions).
// timeOffset: accumulated precomp st offset for keyframe times.
function importLayerSet(layers, assets, yFlip, scaleFactor, compW, compH, groupId, timeOffset, precompCache, frameRate, compWorkArea) {
    var tOff = timeOffset || 0;
    var parentIndSet = {};
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].parent != null) parentIndSet[layers[i].parent] = true;
    }

    var processLayers = [];
    for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        if (l.hd === true) continue;
        if (compWorkArea && !parentIndSet[l.ind]) {
            var lIp = l.ip != null ? Math.round(l.ip) : 0;
            var lOp = l.op != null ? Math.round(l.op) : Infinity;
            if (lIp >= compWorkArea.op || lOp <= compWorkArea.ip) {
                continue;
            }
        }
        if (l.ty === 0) {
            var refEarly = l.refId || l.ref;
            var assetEarly = findAssetById(assets, refEarly);
            var srcEarly = resolvePrecompSourceDims(l, assetEarly, compW, compH);
            processLayers.push({
                index: i,
                layer: l,
                kind: "precomp",
                precompW: srcEarly.w,
                precompH: srcEarly.h
            });
        } else if (l.ty === 1) {
            processLayers.push({ index: i, layer: l, kind: "solid" });
        } else if (l.ty === 2) {
            processLayers.push({ index: i, layer: l, kind: "image" });
        } else if (l.ty === 4) {
            var shapes = getAllShapesFromLayer(l);
            if (shapes.length > 0) {
                processLayers.push({ index: i, layer: l, kind: "shape", shapes: shapes });
            } else if (parentIndSet[l.ind]) {
                processLayers.push({ index: i, layer: l, kind: "null" });
            }
        } else if (l.ty === 5) {
            processLayers.push({ index: i, layer: l, kind: "text" });
        } else if (l.ty === 3 && parentIndSet[l.ind]) {
            processLayers.push({ index: i, layer: l, kind: "null" });
        }
    }

    // Relocate each null group to the position of its topmost child in
    // processLayers. AE render order is flat; Cavalry's is hierarchical —
    // children render at their parent group's stack position. Moving the
    // group above its first child ensures correct z-ordering after parenting.
    // Two-pass approach: collect all relocations first, then apply them
    // to avoid index-shifting bugs from in-place splicing.
    var nullRelocations = [];
    for (var ni = 0; ni < processLayers.length; ni++) {
        if (processLayers[ni].kind !== "null") continue;
        var nullInd = processLayers[ni].layer.ind;
        var firstChildPos = -1;
        for (var ci = 0; ci < processLayers.length; ci++) {
            if (ci === ni) continue;
            if (processLayers[ci].layer.parent === nullInd) {
                firstChildPos = ci;
                break;
            }
        }
        if (firstChildPos !== -1 && firstChildPos < ni) {
            nullRelocations.push({ fromIdx: ni, toIdx: firstChildPos });
        }
    }
    if (nullRelocations.length > 0) {
        nullRelocations.sort(function(a, b) { return b.fromIdx - a.fromIdx; });
        var extracted = [];
        for (var ri = 0; ri < nullRelocations.length; ri++) {
            extracted.push({ entry: processLayers.splice(nullRelocations[ri].fromIdx, 1)[0], toIdx: nullRelocations[ri].toIdx });
        }
        extracted.sort(function(a, b) { return a.toIdx - b.toIdx; });
        for (var ri2 = 0; ri2 < extracted.length; ri2++) {
            processLayers.splice(extracted[ri2].toIdx + ri2, 0, extracted[ri2].entry);
        }
    }

    // Contiguity analysis: detect parents whose children are non-contiguous
    // in z-order and insert proxy group entries for each additional block.
    var childToProxyBlock = {};
    var proxyParentInds = {};
    (function() {
        var childrenByParent = {};
        for (var pi = 0; pi < processLayers.length; pi++) {
            var pInd = processLayers[pi].layer.parent;
            if (pInd == null) continue;
            if (!childrenByParent[pInd]) childrenByParent[pInd] = [];
            childrenByParent[pInd].push(pi);
        }
        var proxyInserts = [];
        for (var pKey in childrenByParent) {
            if (!childrenByParent.hasOwnProperty(pKey)) continue;
            var positions = childrenByParent[pKey];
            if (positions.length <= 1) continue;
            var blocks = [[positions[0]]];
            for (var bi = 1; bi < positions.length; bi++) {
                if (positions[bi] === positions[bi - 1] + 1) {
                    blocks[blocks.length - 1].push(positions[bi]);
                } else {
                    var gap = false;
                    for (var gi = positions[bi - 1] + 1; gi < positions[bi]; gi++) {
                        var gLayer = processLayers[gi].layer;
                        if (gLayer.parent != parseInt(pKey, 10) && processLayers[gi].kind !== "proxy") {
                            gap = true; break;
                        }
                    }
                    if (gap) {
                        blocks.push([positions[bi]]);
                    } else {
                        blocks[blocks.length - 1].push(positions[bi]);
                    }
                }
            }
            if (blocks.length <= 1) continue;
            proxyParentInds[pKey] = true;
            var parentLayer = null;
            for (var fi = 0; fi < processLayers.length; fi++) {
                if (processLayers[fi].layer.ind === parseInt(pKey, 10)) {
                    parentLayer = processLayers[fi].layer; break;
                }
            }
            for (var bk = 0; bk < blocks.length; bk++) {
                for (var ci2 = 0; ci2 < blocks[bk].length; ci2++) {
                    childToProxyBlock[processLayers[blocks[bk][ci2]].layer.ind] = { parentInd: parseInt(pKey, 10), block: bk };
                }
                if (bk > 0) {
                    proxyInserts.push({
                        insertBefore: blocks[bk][0],
                        parentInd: parseInt(pKey, 10),
                        parentLayer: parentLayer,
                        block: bk
                    });
                }
            }
        }
        proxyInserts.sort(function(a, b) { return b.insertBefore - a.insertBefore; });
        for (var ii = 0; ii < proxyInserts.length; ii++) {
            var ins = proxyInserts[ii];
            var proxyEntry = {
                index: -1,
                layer: { ind: -(ins.parentInd * 100 + ins.block), nm: (ins.parentLayer ? ins.parentLayer.nm : "Null") + " [proxy]", parent: null },
                kind: "proxy",
                proxyForInd: ins.parentInd,
                proxyBlock: ins.block
            };
            processLayers.splice(ins.insertBefore, 0, proxyEntry);
            for (var ck in childToProxyBlock) {
                if (!childToProxyBlock.hasOwnProperty(ck)) continue;
                if (childToProxyBlock[ck].parentInd === ins.parentInd && childToProxyBlock[ck].block === ins.block) {
                    childToProxyBlock[ck].proxyInd = proxyEntry.layer.ind;
                }
            }
        }
    })();

    var layerXformByInd = {};
    var layerPivotByInd = {};
    var targetIdsByInd = {};
    var maskIndexByTarget = {};
    var createdIds = [];
    var createdLayers = [];

    // Pass 1: Create all nodes (backward iteration — Cavalry prepends new nodes)
    for (var si = processLayers.length - 1; si >= 0; si--) {
        var entry = processLayers[si];
        var layer = entry.layer;
        var name = layer.nm || "Layer " + (entry.index + 1);
        var nodeId;

        if (entry.kind === "solid") {
            try {
                nodeId = createSolidLayer(layer, name, yFlip, scaleFactor, compW, compH, layer.parent != null);
            } catch (e) {
                console.log("Lottie Importer: Could not create solid layer '" + name + "': " + e.message);
                continue;
            }
            targetIdsByInd[layer.ind] = [nodeId];
        } else if (entry.kind === "image") {
            try {
                nodeId = createImageLayer(layer, assets, name, yFlip, scaleFactor, compW, compH);
                if (!nodeId) continue;
            } catch (e) {
                console.log("Lottie Importer: Could not create image layer '" + name + "': " + e.message);
                continue;
            }
            targetIdsByInd[layer.ind] = [nodeId];
        } else if (entry.kind === "text") {
            try {
                nodeId = createTextLayer(layer, name, yFlip, scaleFactor, compW, compH);
                if (!nodeId) continue;
            } catch (e) {
                console.log("Lottie Importer: Could not create text layer '" + name + "': " + e.message);
                continue;
            }
            targetIdsByInd[layer.ind] = [nodeId];
        } else if (entry.kind === "precomp") {
            var assetId = layer.refId || layer.ref;
            var asset = null;
            for (var ai = 0; ai < (assets || []).length; ai++) {
                if (assets[ai].id === assetId) { asset = assets[ai]; break; }
            }
            if (!asset || !asset.layers) continue;
            var childSt = layer.st != null ? layer.st : 0;
            var sourceDims = resolvePrecompSourceDims(layer, asset, compW, compH);
            var assetW = sourceDims.w;
            var assetH = sourceDims.h;

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
            applyMasks(layer, [nodeId], yFlip, scaleFactor, nodeId, tOff, maskIndexByTarget, { w: assetW, h: assetH }, { w: compW, h: compH });
            targetIdsByInd[layer.ind] = [nodeId];
        } else if (entry.kind === "null") {
            try {
                nodeId = createGroup(name);
            } catch (e) {
                console.log("Lottie Importer: Could not create null layer '" + name + "': " + e.message);
                continue;
            }
        } else if (entry.kind === "proxy") {
            try {
                nodeId = createGroup(name);
            } catch (e) {
                console.log("Lottie Importer: Could not create proxy group '" + name + "': " + e.message);
                continue;
            }
        } else if (entry.kind === "shape") {
            var shapeList = entry.shapes;
            var targetIds = [];
            if (shapeList.length === 1 && !shapeList[0].polyStar && shapeList[0].isCompound && shapeList[0].compoundPaths) {
                var s0c = shapeList[0];
                var combinedPath = new cavalry.Path();
                for (var cp = 0; cp < s0c.compoundPaths.length; cp++) {
                    appendLottiePathToCavalryPath(combinedPath, s0c.compoundPaths[cp].pathData,
                        yFlip, scaleFactor, s0c.compoundPaths[cp].groupOffset);
                }
                var shapeId;
                try {
                    shapeId = api.createEditable(combinedPath, name);
                } catch (e) {
                    console.log("Lottie Importer: Could not create compound shape '" + name + "': " + e.message);
                    continue;
                }
                applyShapeStyle(shapeId, s0c, scaleFactor, tOff, yFlip);
                animateCompoundShapePaths(shapeId, s0c.compoundPaths, yFlip, scaleFactor, tOff);
                try { nodeId = createGroup(name); } catch (e) { nodeId = shapeId; }
                if (nodeId !== shapeId) { try { api.parent(shapeId, nodeId); } catch (e) {} }
                targetIds = [shapeId];
            } else if (shapeList.length === 1 && shapeList[0].polyStar) {
                var ps0 = shapeList[0];
                var psId;
                try {
                    psId = createPolyStar(ps0.polyStar, name, yFlip, scaleFactor, ps0.groupOffset, compW, compH);
                } catch (e) {
                    console.log("Lottie Importer: Could not create PolyStar '" + name + "': " + e.message);
                    continue;
                }
                applyShapeStyle(psId, ps0, scaleFactor, tOff, yFlip);
                try { nodeId = createGroup(name); } catch (e) { nodeId = psId; }
                if (nodeId !== psId) { try { api.parent(psId, nodeId); } catch (e) {} }
                targetIds = [psId];
            } else if (shapeList.length === 1) {
                var s0 = shapeList[0];
                if (!s0.pathData && !s0.polyStar) continue;
                var sId;
                if (s0.polyStar) {
                    try {
                        sId = createPolyStar(s0.polyStar, name, yFlip, scaleFactor, s0.groupOffset, compW, compH);
                    } catch (e) { continue; }
                } else {
                    var path = lottiePathToCavalryPath(s0.pathData, yFlip, scaleFactor, s0.groupOffset);
                    if (!path) continue;
                    try {
                        sId = api.createEditable(path, name);
                    } catch (e) {
                        console.log("Lottie Importer: Could not create shape '" + name + "': " + e.message);
                        continue;
                    }
                    animateShapePath(sId, s0.pathKs, yFlip, scaleFactor, s0.groupOffset, tOff);
                }
                applyShapeStyle(sId, s0, scaleFactor, tOff, yFlip);
                try { nodeId = createGroup(name); } catch (e) { nodeId = sId; }
                if (nodeId !== sId) { try { api.parent(sId, nodeId); } catch (e) {} }
                targetIds = [sId];
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
                    if (s.polyStar) {
                        try {
                            subId = createPolyStar(s.polyStar, name + " " + (ss + 1), yFlip, scaleFactor, s.groupOffset, compW, compH);
                        } catch (e) { continue; }
                        applyShapeStyle(subId, s, scaleFactor, tOff, yFlip);
                    } else if (s.isCompound && s.compoundPaths) {
                        var cPath = new cavalry.Path();
                        for (var cp2 = 0; cp2 < s.compoundPaths.length; cp2++) {
                            appendLottiePathToCavalryPath(cPath, s.compoundPaths[cp2].pathData,
                                yFlip, scaleFactor, s.compoundPaths[cp2].groupOffset);
                        }
                        try {
                            subId = api.createEditable(cPath, name + " " + (ss + 1));
                        } catch (e) { continue; }
                        applyShapeStyle(subId, s, scaleFactor, tOff, yFlip);
                        animateCompoundShapePaths(subId, s.compoundPaths, yFlip, scaleFactor, tOff);
                    } else {
                        if (!s.pathData) continue;
                        var sp = lottiePathToCavalryPath(s.pathData, yFlip, scaleFactor, s.groupOffset);
                        if (!sp) continue;
                        try {
                            subId = api.createEditable(sp, name + " " + (ss + 1));
                        } catch (e) { continue; }
                        applyShapeStyle(subId, s, scaleFactor, tOff, yFlip);
                        animateShapePath(subId, s.pathKs, yFlip, scaleFactor, s.groupOffset, tOff);
                    }
                    try { api.parent(subId, nodeId); } catch (e) {}
                    targetIds.push(subId);
                }
            }
            applyMasks(layer, targetIds, yFlip, scaleFactor, nodeId, tOff, maskIndexByTarget, null, { w: compW, h: compH });
            targetIdsByInd[layer.ind] = targetIds;
        } else {
            continue;
        }

        var rigLayer = layer;
        var rigEntry = entry;
        if (entry.kind === "proxy") {
            rigLayer = layer;
            for (var rpx = 0; rpx < layers.length; rpx++) {
                if (layers[rpx].ind === entry.proxyForInd) {
                    rigLayer = layers[rpx];
                    break;
                }
            }
            rigEntry = { kind: "null" };
        }
        var rigN = buildLayerTransformRig(nodeId, rigLayer, rigEntry);
        layerXformByInd[layer.ind] = rigN.xform;
        layerPivotByInd[layer.ind] = rigN.pivot;
        try {
            applyBlendModeToNode(rigN.xform, rigLayer.bm != null ? rigLayer.bm : layer.bm);
        } catch (eBm) {}

        createdIds.push(rigN.xform);
        createdLayers.push(entry);

        try {
            if (layer.ip != null) api.setInFrame(rigN.xform, Math.round(layer.ip + tOff));
            if (layer.op != null) api.setOutFrame(rigN.xform, Math.round(layer.op + tOff));
        } catch (e) {
            console.log("Lottie Importer: setInFrame/setOutFrame failed for '" + name + "': " + e.message);
        }
    }

    // Build ind→layer lookup for frame-range expansion below
    var layerByInd = {};
    for (var li = 0; li < layers.length; li++) {
        layerByInd[layers[li].ind] = layers[li];
    }

    // Matte-source parents: td=1 layers that also have children need a
    // proxy so children stay visible when the matte source is hidden.
    var matteProxyByInd = {};
    var matteProxyXformByInd = {};
    for (var mi = 0; mi < layers.length; mi++) {
        if (layers[mi].td !== 1) continue;
        var matteInd2 = layers[mi].ind;
        var hasChildren = layers.some(function(c) { return c.parent === matteInd2; });
        if (!hasChildren) continue;
        var matteNodeId = layerXformByInd[matteInd2];
        if (!matteNodeId) continue;
        try {
            var mLayer = layers[mi];
            var mRigEntry = { kind: "null" };
            if (mLayer.ty === 0) {
                var mAss = findAssetById(assets, mLayer.refId || mLayer.ref);
                var mSrc = resolvePrecompSourceDims(mLayer, mAss, compW, compH);
                mRigEntry = { kind: "precomp", precompW: mSrc.w, precompH: mSrc.h };
            }
            var matteProxyLeaf = createGroup((mLayer.nm || "Matte") + " [parent]");
            var rigMatte = buildLayerTransformRig(matteProxyLeaf, mLayer, mRigEntry);
            matteProxyByInd[matteInd2] = rigMatte.pivot;
            matteProxyXformByInd[matteInd2] = rigMatte.xform;
            if (mLayer.ip != null) { try { api.setInFrame(rigMatte.xform, Math.round(mLayer.ip + tOff)); } catch (e) {} }
            if (mLayer.op != null) { try { api.setOutFrame(rigMatte.xform, Math.round(mLayer.op + tOff)); } catch (e) {} }
        } catch (e) {
            console.log("Lottie Importer: Could not create matte proxy for '" + layers[mi].nm + "': " + e.message);
        }
    }

    // Pass 2: Unified parenting via single backward iteration over
    // processLayers.  api.parent prepends, so last-to-first preserves
    // Lottie's top-to-bottom stacking.  By iterating processLayers (which
    // interleaves proxy entries at the correct z-positions) instead of the
    // raw layers array, proxies end up at the right depth relative to the
    // real parent — not always above it.
    for (var j = processLayers.length - 1; j >= 0; j--) {
        var uEntry = processLayers[j];
        var uLayer = uEntry.layer;
        var childXform = layerXformByInd[uLayer.ind];
        if (!childXform) continue;

        if (uEntry.kind === "proxy") {
            var realPL = layerByInd[uEntry.proxyForInd];
            var gpTarget = null;
            if (realPL && realPL.parent != null) gpTarget = layerPivotByInd[realPL.parent];
            if (!gpTarget && groupId) gpTarget = groupId;
            if (gpTarget) {
                try { api.parent(childXform, gpTarget); } catch (e) {}
            }
        } else if (uLayer.parent != null) {
            var parentXform = layerXformByInd[uLayer.parent];
            if (!parentXform || childXform === parentXform) continue;

            var uTarget = layerPivotByInd[uLayer.parent];
            if (uTarget == null) uTarget = parentXform;
            if (matteProxyByInd[uLayer.parent]) {
                uTarget = matteProxyByInd[uLayer.parent];
            } else {
                var uBlock = childToProxyBlock[uLayer.ind];
                if (uBlock && uBlock.block > 0 && uBlock.proxyInd != null) {
                    var uProxyPivot = layerPivotByInd[uBlock.proxyInd];
                    if (uProxyPivot != null) uTarget = uProxyPivot;
                }
            }

            try { api.parent(childXform, uTarget); }
            catch (e) { console.log("Lottie Importer: Could not parent '" + (uLayer.nm || uLayer.ind) + "': " + e.message); }

            // In AE a parent's transform applies even outside its in/out
            // range; Cavalry hides children of inactive parents, so expand.
            var frP = layerByInd[uLayer.parent];
            if (frP && uLayer.ip != null && frP.ip != null && uLayer.ip < frP.ip) {
                try { api.setInFrame(parentXform, Math.round(uLayer.ip + tOff)); frP.ip = uLayer.ip; } catch (e) {}
            }
            if (frP && uLayer.op != null && frP.op != null && uLayer.op > frP.op) {
                try { api.setOutFrame(parentXform, Math.round(uLayer.op + tOff)); frP.op = uLayer.op; } catch (e) {}
            }
        } else if (groupId) {
            try { api.parent(childXform, groupId); } catch (e) {}
        }
    }
    // Set each proxy's frame range to its real parent's (already-expanded) range
    for (var pfr = 0; pfr < processLayers.length; pfr++) {
        if (processLayers[pfr].kind !== "proxy") continue;
        var proxyFrId = layerXformByInd[processLayers[pfr].layer.ind];
        var realPFrL = layerByInd[processLayers[pfr].proxyForInd];
        if (proxyFrId && realPFrL) {
            if (realPFrL.ip != null) { try { api.setInFrame(proxyFrId, Math.round(realPFrL.ip + tOff)); } catch (e) {} }
            if (realPFrL.op != null) { try { api.setOutFrame(proxyFrId, Math.round(realPFrL.op + tOff)); } catch (e) {} }
        }
    }
    // Matte proxy groups: parent to grandparent (the matte source's parent)
    for (var mk in matteProxyXformByInd) {
        if (!matteProxyXformByInd.hasOwnProperty(mk)) continue;
        var matteLayer = layerByInd[parseInt(mk, 10)];
        var matteProxyXf = matteProxyXformByInd[mk];
        if (matteLayer && matteLayer.parent != null) {
            var matteGpPivot = layerPivotByInd[matteLayer.parent];
            if (matteGpPivot == null) matteGpPivot = layerXformByInd[matteLayer.parent];
            if (matteGpPivot) {
                try { api.parent(matteProxyXf, matteGpPivot); } catch (e) {}
                continue;
            }
        }
        if (groupId) {
            try { api.parent(matteProxyXf, groupId); } catch (e) {}
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
        var matteHideId = layerXformByInd[matteInd];
        if (!matteHideId) {
            console.log("Lottie Importer: Track matte source ind=" + matteInd + " not found in layerXformByInd");
            continue;
        }
        var matteConnectId = (targetIdsByInd[matteInd] && targetIdsByInd[matteInd][0]) ? targetIdsByInd[matteInd][0] : matteHideId;
        var mattedTargets = targetIdsByInd[matted.ind];
        if (!mattedTargets || mattedTargets.length === 0) {
            var fallback = layerXformByInd[matted.ind];
            if (fallback) mattedTargets = [fallback];
        }
        if (!mattedTargets) {
            console.log("Lottie Importer: Track matte target ind=" + matted.ind + " not found");
            continue;
        }
        try { api.set(matteHideId, { "hidden": true }); }
        catch (e) { console.log("Lottie Importer: Could not hide matte " + matteHideId + ": " + e.message); }
        for (var mt = 0; mt < mattedTargets.length; mt++) {
            var tgt = mattedTargets[mt];
            var idx = maskIndexByTarget[tgt] || 0;
            try {
                api.addArrayIndex(tgt, "masks");
                api.connect(matteConnectId, "id", tgt, "masks." + idx + ".id");
                var tmModeObj = {};
                tmModeObj["masks." + idx + ".mode"] = 2; // Intersect for track mattes
                api.set(tgt, tmModeObj);
                maskIndexByTarget[tgt] = idx + 1;
                console.log("Lottie Importer: Connected track matte " + matteConnectId + " -> " + tgt + " at masks." + idx);
            } catch (e) {
                console.log("Lottie Importer: Track matte connect failed for " + tgt + " at index " + idx + ": " + e.message);
            }
        }
    }

    // Build precomp-dimension lookup so children parented to a
    // compositionReference can subtract the parent comp center.
    var precompDimsByInd = {};
    for (var pdi = 0; pdi < layers.length; pdi++) {
        if (layers[pdi].ty === 0) {
            var refP = layers[pdi].refId || layers[pdi].ref;
            var assetP = findAssetById(assets, refP);
            var srcP = resolvePrecompSourceDims(layers[pdi], assetP, compW, compH);
            if (srcP.w > 0 && srcP.h > 0) {
                precompDimsByInd[layers[pdi].ind] = { w: srcP.w, h: srcP.h };
            }
        }
    }

    // Pass 3: Transforms
    for (var ti = 0; ti < createdLayers.length; ti++) {
        var entry = createdLayers[ti];
        if (entry.kind === "proxy") {
            var realPLayer = layerByInd[entry.proxyForInd];
            if (!realPLayer || !realPLayer.ks) continue;
            var pxXform = layerXformByInd[entry.layer.ind];
            var pxPivot = layerPivotByInd[entry.layer.ind];
            if (!pxXform) continue;
            var pxUsePivot = pxPivot && pxXform !== pxPivot;
            var rpHasParent = groupId ? true : (realPLayer.parent != null);
            var rpTransform = getLayerTransform(realPLayer.ks, yFlip, rpHasParent, compW, compH, scaleFactor, !pxUsePivot);
            var rpParentPCD = (realPLayer.parent != null) ? precompDimsByInd[realPLayer.parent] : null;
            if (rpParentPCD) {
                rpTransform.position[0] -= scaleFactor * (rpParentPCD.w / 2);
                rpTransform.position[1] += scaleFactor * (rpParentPCD.h / 2);
            }
            if (pxUsePivot && pxPivot && realPLayer.ks) {
                var rppa = getPivotAnchorForLayer(realPLayer.ks, 0, 0);
                try {
                    api.set(pxPivot, {
                        "position": [-rppa.ax * scaleFactor, scaleFactor * (yFlip ? rppa.ay : -rppa.ay)]
                    });
                } catch (ePxp) {}
            }
            var rpProps = {
                "position": rpTransform.position,
                "rotation.z": rpTransform.rotation,
                "scale.x": rpTransform.scale[0] / 100,
                "scale.y": rpTransform.scale[1] / 100
            };
            if (rpTransform.skew && Math.abs(rpTransform.skew) > 0.001) {
                var rpSkRad = (rpTransform.skewAxis || 0) * Math.PI / 180;
                rpProps["skew.x"] = rpTransform.skew * Math.cos(rpSkRad);
                rpProps["skew.y"] = rpTransform.skew * Math.sin(rpSkRad);
            }
            api.set(pxXform, rpProps);
            keyframeAnimatedTransforms(pxXform, realPLayer.ks, yFlip, rpHasParent,
                compW, compH, scaleFactor, tOff, null, rpParentPCD, pxUsePivot, true);
            continue;
        }
        var tLayer = entry.layer;
        var tXform = layerXformByInd[tLayer.ind];
        var tPivot = layerPivotByInd[tLayer.ind];
        if (!tXform) continue;
        var usePivotRig = tPivot && tXform !== tPivot;
        var hasParent = groupId ? true : (tLayer.parent != null);
        var transform = getLayerTransform(tLayer.ks, yFlip, hasParent, compW, compH, scaleFactor, !usePivotRig);

        // In Cavalry, children of a compositionReference are positioned
        // relative to the comp center. In AE, child positions are in the
        // parent's layer space (origin at top-left). Subtract the parent
        // comp center to align coordinate systems.
        var parentPCD = (tLayer.parent != null) ? precompDimsByInd[tLayer.parent] : null;
        if (parentPCD) {
            transform.position[0] -= scaleFactor * (parentPCD.w / 2);
            transform.position[1] += scaleFactor * (parentPCD.h / 2);
        }

        // Cavalry compositionReferences are positioned by their center.
        // Outer transform is T(p)*R*S; anchor is on child pivot when usePivotRig.
        var precompDims = null;
        if (entry.kind === "precomp" && entry.precompW && entry.precompH) {
            var lsx = transform.scale[0] / 100;
            var lsy = transform.scale[1] / 100;
            transform.position[0] += scaleFactor * (entry.precompW / 2 * lsx);
            transform.position[1] -= scaleFactor * (entry.precompH / 2 * lsy);
            precompDims = { w: entry.precompW, h: entry.precompH };
        }

        if (usePivotRig && tPivot && tLayer.ks) {
            var preW = (entry.kind === "precomp" && entry.precompW) ? entry.precompW : 0;
            var preH = (entry.kind === "precomp" && entry.precompH) ? entry.precompH : 0;
            var paSet = getPivotAnchorForLayer(tLayer.ks, preW, preH);
            try {
                api.set(tPivot, {
                    "position": [-paSet.ax * scaleFactor, scaleFactor * (yFlip ? paSet.ay : -paSet.ay)]
                });
            } catch (ePv2) {}
        }

        var setProps = {
            "position": transform.position,
            "rotation.z": transform.rotation,
            "scale.x": transform.scale[0] / 100,
            "scale.y": transform.scale[1] / 100
        };
        if (entry.kind !== "null" && transform.opacity != null && transform.opacity < 100) {
            setProps["opacity"] = transform.opacity;
        }
        if (transform.skew && Math.abs(transform.skew) > 0.001) {
            var skRad = (transform.skewAxis || 0) * Math.PI / 180;
            var skX = transform.skew * Math.cos(skRad);
            var skY = transform.skew * Math.sin(skRad);
            try {
                setProps["skew.x"] = skX;
                setProps["skew.y"] = skY;
            } catch (e) {}
        }
        api.set(tXform, setProps);
        keyframeAnimatedTransforms(tXform, tLayer.ks, yFlip, hasParent, compW, compH, scaleFactor, tOff, precompDims, parentPCD, usePivotRig,
            entry.kind === "null");
    }

    // Apply transforms to matte proxy groups (duplicating the matte source's local transforms)
    for (var mpk in matteProxyXformByInd) {
        if (!matteProxyXformByInd.hasOwnProperty(mpk)) continue;
        var mpLayer = layerByInd[parseInt(mpk, 10)];
        if (!mpLayer || !mpLayer.ks) continue;
        var mpXform = matteProxyXformByInd[mpk];
        var mpPivot = matteProxyByInd[mpk];
        if (!mpXform) continue;
        var mpUsePivot = mpPivot && mpXform !== mpPivot;
        var mpHasParent = groupId ? true : (mpLayer.parent != null);
        var mpTransform = getLayerTransform(mpLayer.ks, yFlip, mpHasParent, compW, compH, scaleFactor, !mpUsePivot);
        var mpParentPCD = (mpLayer.parent != null) ? precompDimsByInd[mpLayer.parent] : null;
        if (mpParentPCD) {
            mpTransform.position[0] -= scaleFactor * (mpParentPCD.w / 2);
            mpTransform.position[1] += scaleFactor * (mpParentPCD.h / 2);
        }
        if (mpUsePivot && mpPivot && mpLayer.ks) {
            var mpPreW = 0;
            var mpPreH = 0;
            if (mpLayer.ty === 0) {
                var mpAss2 = findAssetById(assets, mpLayer.refId || mpLayer.ref);
                var mpSrc2 = resolvePrecompSourceDims(mpLayer, mpAss2, compW, compH);
                mpPreW = mpSrc2.w;
                mpPreH = mpSrc2.h;
            }
            var mpa2 = getPivotAnchorForLayer(mpLayer.ks, mpPreW, mpPreH);
            try {
                api.set(mpPivot, {
                    "position": [-mpa2.ax * scaleFactor, scaleFactor * (yFlip ? mpa2.ay : -mpa2.ay)]
                });
            } catch (eMpv) {}
        }
        var mpProps = {
            "position": mpTransform.position,
            "rotation.z": mpTransform.rotation,
            "scale.x": mpTransform.scale[0] / 100,
            "scale.y": mpTransform.scale[1] / 100
        };
        if (mpTransform.skew && Math.abs(mpTransform.skew) > 0.001) {
            var mpSkRad = (mpTransform.skewAxis || 0) * Math.PI / 180;
            mpProps["skew.x"] = mpTransform.skew * Math.cos(mpSkRad);
            mpProps["skew.y"] = mpTransform.skew * Math.sin(mpSkRad);
        }
        try {
            api.set(mpXform, mpProps);
            keyframeAnimatedTransforms(mpXform, mpLayer.ks, yFlip, mpHasParent,
                compW, compH, scaleFactor, tOff, null, mpParentPCD, mpUsePivot, true);
        } catch (e) {
            console.log("Lottie Importer: Could not set matte proxy transforms: " + e.message);
        }
    }

    return createdIds;
}

function importLottie(lottie) {
    lottieAssetGroupId = null;
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
            if (api.hasAttribute(activeComp, "startFrame")) api.set(activeComp, { "startFrame": Math.round(compInfo.ip) });
            if (api.hasAttribute(activeComp, "endFrame")) api.set(activeComp, { "endFrame": Math.round(compInfo.op) });
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
    var workArea = { ip: Math.round(compInfo.ip), op: Math.round(compInfo.op) };
    var allCreatedIds = importLayerSet(rootLayers, assets, yFlip, scaleFactor, compInfo.w, compInfo.h, null, 0, precompCache, compInfo.fr, workArea);

    var precompIds = [];
    for (var key in precompCache) {
        if (precompCache.hasOwnProperty(key)) precompIds.push(precompCache[key]);
    }
    if (precompIds.length > 0) {
        try {
            var groupName = lottie.nm || "Lottie Precomps";
            var assetGroupId = api.createAssetGroup(groupName);
            for (var gi = 0; gi < precompIds.length; gi++) {
                api.parent(precompIds[gi], assetGroupId);
            }
        } catch (e) {
            console.log("Lottie Importer: Could not create asset group for precomps: " + e.message);
        }
    }

    if (allCreatedIds.length === 0) throw new Error("No shape layers found in this Lottie.");
    api.select(allCreatedIds);
    return allCreatedIds.length;
}
