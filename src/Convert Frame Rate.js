// Convert Frame Rate for Cavalry
// Converts frame rate while maintaining visual timing of animations and easing curves
// Developed with assistance from Cursor
//
// Proper bezier handle conversion for frame rate changes
// This script preserves the exact visual easing when converting between frame rates
// by extracting cubic bezier values and reapplying them to new frame timing.
//
// WHAT GETS RETIMED:
// 1. Keyframes - moved by the frame rate ratio, with collision handling so they can't reorder
// 2. Easing - bezier handles scaled along the time axis only, per segment, so curves (and
//    therefore motion paths) come out identical
// 3. Footage and audio - Image Shader time offsets and Sound frame offsets
// 4. Frame-based Attributes on behaviours, deformers and groups (see FRAME_ATTRIBUTES), and
//    per-frame rates like Noise frequency (see PER_FRAME_RATE_ATTRIBUTES) - keyframed values included
// 5. Layer in/out points, Composition frame range and playback range
// 6. Pre-Comp time offsets
//
// Pre-Comp contents are left alone on purpose: Cavalry re-interpolates a Pre-Comp to its parent's
// frame rate (or preserves its own rate when Preserve Frame Rate is on), so their contents
// stay in sync without being touched. Only where the Pre-Comp starts is moved.
//
// KEY LEARNINGS ABOUT CAVALRY EASING:
// 1. Use api.modifyKeyframeTangent() for reliable bezier handle modification
// 2. Address handles by layer + frame - keyframe IDs go stale as soon as keyframes move
// 3. Keyframe values don't change during a retime, so handle Y must not change either
// 4. Scale each segment by its own duration ratio to absorb rounding

// Check Update from Github
// Usage:
//   1. Create a versions.json file in the root of your repository with the following format:
//      {
//          "scriptName": "1.0.0"
//      }
//   2. Paste this entire code block
//   3. Call the function:
//      // Default (console warning)
//      checkForUpdate(GITHUB_REPO, scriptName, currentVersion);
//
//      // Advanced (UI callback)
//      checkForUpdate(GITHUB_REPO, scriptName, currentVersion, function(updateAvailable, newVersion) {
//          if (updateAvailable) {
//              statusLabel.setText("⚠ Update " + newVersion + " available!");
//          }
//      });

var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "Convert Frame Rate";  // Must match key your repo's versions.json
var currentVersion = "1.1.0";

function compareVersions(v1, v2) {
    /* Compare two semantic version strings (e.g., "1.0.0" vs "1.0.1") */
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
    // Uncomment below to reset the version check for testing
    // api.setPreferenceObject(scriptName + "_update_check", {
    //     lastCheck: null,
    //     latestVersion: null
    // });
    
    var now = new Date().getTime();
    var oneDayAgo = now - (24 * 60 * 60 * 1000);
    var shouldFetchFromGithub = true;
    var cachedLatestVersion = null;
    
    // Check if we have cached data
    if (api.hasPreferenceObject(scriptName + "_update_check")) {
        var prefs = api.getPreferenceObject(scriptName + "_update_check");
        cachedLatestVersion = prefs.latestVersion;
        
        // If we checked recently, use cached version (don't fetch from GitHub)
        if (prefs.lastCheck && prefs.lastCheck > oneDayAgo) {
            shouldFetchFromGithub = false;
        }
    }
    
    // If we don't need to fetch, just compare current version to cached latest
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
    
    // Perform the version check
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
            
            // Remove 'v' prefix if present (e.g., "v1.0.0" -> "1.0.0")
            if (latestVersion.startsWith('v')) {
                latestVersion = latestVersion.substring(1);
            }
            
            // Save latest version to preferences (always save, regardless of comparison)
            api.setPreferenceObject(scriptName + "_update_check", {
                lastCheck: new Date().getTime(),
                latestVersion: latestVersion
            });
            
            // Compare and notify if update available
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

checkForUpdate(GITHUB_REPO, scriptName, currentVersion);

// End update checker


// Global variables for UI state
var currentFps = 25;
var activeComp = null;

// Main execution function
function main() {


    // Create and show the UI
    createUI();
}

// Panel styling: colours from Cavalry's theme (so light themes work), styled
// ui.Buttons, and results in a status line rather than only the console.
function theme() {
    var pick = function (name, fallback) {
        try { var c = ui.getThemeColor(name); return typeof c === "string" && c.charAt(0) === "#" ? c : fallback; } catch (e) { return fallback; }
    };
    var mix = function (a, b, t) {
        var ch = function (h, i) { return parseInt(String(h).replace("#", "").substr(i * 2, 2), 16); }, out = "#";
        for (var i = 0; i < 3; i++) { var v = Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t); out += (v < 16 ? "0" : "") + v.toString(16); }
        return out;
    };
    var bg = pick("Base", "#373737"), text = pick("Text", "#f1f1f1"), accent = pick("Accent1", "#3ddc84");
    return {
        primary: mix(bg, accent, 0.55),
        muted: mix(text, bg, 0.45),
        warn: "#e8a33d"
    };
}

function label(text, size, color) {
    var l = new ui.Label(text);
    l.setFontSize(size || 12);
    if (color) l.setTextColor(color);
    l.setTransparentForMouseEvents(true);
    return l;
}

// Create the UI with text input and Apply button
function createUI() {
    var T = theme();
    ui.setTitle("Convert Frame Rate");

    var root = new ui.VLayout();
    root.setMargins(4, 4, 4, 4);
    root.setSpaceBetween(8);

    var row = new ui.HLayout();
    row.setSpaceBetween(6);
    var fpsInput = new ui.LineEdit();
    fpsInput.setPlaceholder("New frame rate…");
    fpsInput.setFixedHeight(26);
    row.add(fpsInput);

    // A real ui.Button with onClick: long work from a Container's mouse handler has crashed Cavalry
    var applyButton = new ui.Button("Apply");
    applyButton.setFontSize(12);
    applyButton.setFixedHeight(26);
    applyButton.setDrawStroke(false);
    applyButton.setCornerRounding(4);
    applyButton.setBackgroundColor(T.primary);
    row.add(applyButton);
    root.add(row);

    var status = label("", 11, T.muted);
    root.add(status);

    var note = label("Expressions and JavaScript layers need checking by hand.", 10, T.muted);
    root.add(note);
    root.addStretch();

    function showCurrent() {
        var comp = api.getActiveComp();
        status.setTextColor(T.muted);
        status.setText(comp ? "Active composition: " + api.get(comp, "fps") + " fps" : "No active composition.");
    }

    function fail(message) {
        status.setTextColor(T.warn);
        status.setText(message);
    }

    applyButton.onClick = function() {
        var newFpsString = fpsInput.getText().trim();
        var newFps = parseFloat(newFpsString);
        if (!newFpsString || isNaN(newFps) || newFps <= 0 || newFps > 120) {
            fail("Enter a frame rate between 1 and 120.");
            return;
        }

        status.setText("Converting…");
        var result;
        ui.setCallbacksActive(false);  // no panel callbacks while the conversion runs
        try {
            result = convertFrameRate(newFps);
        } catch (e) {
            console.error("Convert Frame Rate: " + (e && e.stack || e));
            result = "Failed: " + (e && e.message || e);
        } finally {
            ui.setCallbacksActive(true);
        }

        if (typeof result === "string") {
            fail(result);
            return;
        }
        status.setTextColor(result.checks ? T.warn : T.muted);
        status.setText("Converted " + result.from + " → " + result.to + " fps · " + result.keys + " keyframes" +
            (result.checks ? " · " + result.checks + " layers to check in the console" : ""));
    };

    ui.add(root);
    ui.setMinimumWidth(260);
    showCurrent();
    ui.show();
}

// Execute main function
main();

// Attributes that hold a number of frames, by layer type. Every one of these scales
// with the frame rate, otherwise the thing it offsets drifts out of sync.
// The Frame behaviour is handled separately because one of its Attributes scales inversely.
var FRAME_ATTRIBUTES = {
    "sound":           ["frameOffset"],          // audio offset - keeps sound in sync
    "autoAnimate":     ["timeOffset"],
    "trails":          ["startFrame", "length", "timeOffset"],
    "duplicator":      ["shapeTimeOffset"],
    "schedulingGroup": ["startFrame", "endFrame", "childOffset", "overlap"],
    "oscillator":      ["timeOffset"],
    "noise":           ["generator.loopLength"],
    "subMesh":         ["shapeTimeOffset"]
};

// Frame-based Attributes that can sit on any layer type
var ANY_LAYER_FRAME_ATTRIBUTES = ["posterizeTimeOffset", "layoutFrame"];

// Rates counted per frame - these scale inversely, so the motion keeps its speed in seconds.
// Noise frequency is per frame: double the frame rate without this and every Noise runs twice as fast.
var PER_FRAME_RATE_ATTRIBUTES = {
    "noise": ["generator.frequency"]
};

function contains(list, item) {
    return !!list && list.indexOf(item) !== -1;
}

// How much an Attribute's *value* scales with the frame rate: ratio for frame counts,
// 1 / ratio for per-frame rates, 1 for everything else. Used for keyframed values -
// moving the keys only changes when they happen, not a value that is itself in frames.
function valueScaleFor(layerId, layerType, attrId, ratio) {
    if (contains(FRAME_ATTRIBUTES[layerType], attrId) || contains(ANY_LAYER_FRAME_ATTRIBUTES, attrId)) {
        return ratio;
    }
    if (contains(PER_FRAME_RATE_ATTRIBUTES[layerType], attrId)) {
        return 1 / ratio;
    }
    // Footage retimed by keyframing the Image Shader's Time: source time in Composition frames
    if (layerType === "imageShader" && attrId === "time") {
        return ratio;
    }
    if (layerType === "frame") {
        try {
            if (api.get(layerId, "mode") === 0) {
                if (attrId === "value") return 1 / ratio;
                if (contains(["offset", "startFrame", "cycleLength"], attrId)) return ratio;
            }
        } catch (e) {}
    }
    return 1;
}

// api.offsetLayerTime() also slides keyframes already on the layer (and its host), which the
// keyframe pass has retimed by then. Note every key time first and put back any that moved.
function offsetLayerTimeKeepKeys(layerId, frames) {
    var layers = [layerId];
    try {
        var parent = api.getParent(layerId);
        if (parent) layers.push(parent);
    } catch (e) {}

    var before = [];
    for (var l = 0; l < layers.length; l++) {
        try {
            var attrs = api.getAnimatedAttributes(layers[l]);
            for (var a = 0; a < attrs.length; a++) {
                before.push({ layerId: layers[l], attrId: attrs[a], times: api.getKeyframeTimes(layers[l], attrs[a]) });
            }
        } catch (e) {}
    }

    api.offsetLayerTime(layerId, frames);

    for (var b = 0; b < before.length; b++) {
        var rec = before[b];
        var after = api.getKeyframeTimes(rec.layerId, rec.attrId);
        if (!after || after.length !== rec.times.length || after[0] === rec.times[0]) {
            continue;
        }
        // Moving back by -frames: walk in the direction of travel so keys never land on each other
        var order = [];
        for (var k = 0; k < after.length; k++) order.push(k);
        if (frames < 0) order.reverse();
        for (var o = 0; o < order.length; o++) {
            var move = {};
            move[rec.attrId] = { "frame": after[order[o]], "newFrame": rec.times[order[o]] };
            api.modifyKeyframe(rec.layerId, move);
        }
    }
}

// Scale one un-keyframed frame-based Attribute. Keyframed ones are left alone -
// the keyframe pass has already retimed them, values included.
// isRate: a per-frame rate - never rounded, since a frequency of 1 halved must stay 0.5.
function scaleFrameAttribute(layerId, attrId, scale, isRate) {
    try {
        var keys = api.getKeyframeTimes(layerId, attrId);
        if (keys && keys.length > 0) {
            return;
        }
        var value = api.get(layerId, attrId);
        if (typeof value !== "number" || value === 0) {
            return;
        }
        // Whole-frame Attributes stay whole; rates and increments keep their precision
        var scaled = value * scale;
        if (!isRate && value === Math.round(value)) {
            scaled = Math.round(scaled);
        }
        var payload = {};
        payload[attrId] = scaled;
        api.set(layerId, payload);
        console.log("  - " + layerId + " " + attrId + ": " + value + " → " + scaled);
    } catch (e) {
        // Attribute absent on this layer, or read-only - nothing to convert
    }
}

// Main conversion function
function convertFrameRate(targetFps) {
    activeComp = api.getActiveComp();
    if (!activeComp) {
        return "No active composition.";
    }

    try {
        currentFps = api.get(activeComp, "fps");
        if (!currentFps || currentFps <= 0) {
            currentFps = 25;
        }
    } catch(e) {
        console.log("Could not get current FPS, using default 25");
        currentFps = 25;
    }

    try {
        var fromFps = currentFps;
        var ratio = targetFps / currentFps;
        
        // Store current playhead position to restore later
        var currentPlayheadFrame = api.getFrame();
        
        // Get all layers in the composition
        var allLayers = [];
        try {
            allLayers = api.getCompLayers(false); // false = get all layers including children
        } catch(e) {
            return "Couldn't read the composition's layers.";
        }
        
        var processedLayers = 0;
        var totalKeyframes = 0;
        var layersToCheck = 0;

        // Read the ranges before anything moves
        var currentStartFrame = api.get(activeComp, "startFrame");
        var currentEndFrame = api.get(activeComp, "endFrame");
        var currentPlaybackStart = api.get(activeComp, "playbackStart");
        var currentPlaybackEnd = api.get(activeComp, "playbackEnd");

        // When converting upwards, keyframes and out points land beyond the current end of
        // the Composition and get clamped. Widen the range first so there's room to move
        // into; the final range is set at the end of the conversion.
        if (ratio > 1) {
            api.set(activeComp, {"endFrame": Math.round(currentEndFrame * ratio)});
        }

        // Record every layer's in/out points before anything moves them. They're written back
        // at the very end of the conversion, because two later steps disturb them:
        //
        //  - A layer and the layers it hosts (an Image Shader inside a Footage Shape) share
        //    one set of in/out points, so writing the child also writes the parent. Targets
        //    computed up front from these recorded values make that second write a harmless
        //    no-op; targets computed from live values would scale those layers twice.
        //  - Offsetting footage time (below) slides the host layer's in/out points along with it.
        var inOutPlan = [];
        for (var i = 0; i < allLayers.length; i++) {
            if (!api.layerExists(allLayers[i])) {
                continue;
            }
            try {
                var planIn = api.getInFrame(allLayers[i]);
                var planOut = api.getOutFrame(allLayers[i]);

                // Skip layers spanning the whole Composition - they have no custom points
                if (planIn !== 0 || planOut !== currentEndFrame) {
                    inOutPlan.push({ layerId: allLayers[i], inFrame: planIn, outFrame: planOut });
                }
            } catch (e) {
                // Some layers have no in/out points
            }
        }

        // Process each layer's keyframes
        for (var i = 0; i < allLayers.length; i++) {
            var layerId = allLayers[i];

            // Check if layer exists
            if (!api.layerExists(layerId)) {
                continue;
            }

            // Get all animated attributes for this layer
            var animatedAttrs = [];
            try {
                animatedAttrs = api.getAnimatedAttributes(layerId);
            } catch(e) {
                continue;
            }
            
            var keyLayerType = "";
            try {
                keyLayerType = api.getLayerType(layerId);
            } catch (e) {}

            // Process each animated attribute
            for (var attrIdx = 0; attrIdx < animatedAttrs.length; attrIdx++) {
                var attrId = animatedAttrs[attrIdx];
                var valueScale = valueScaleFor(layerId, keyLayerType, attrId, ratio);

                try {
                    // Get keyframe times and IDs for this attribute
                    var keyframeTimes = api.getKeyframeTimes(layerId, attrId);
                    var keyframeIds = api.getKeyframeIdsForAttribute(layerId, attrId);
                    
                    if (!keyframeTimes || keyframeTimes.length === 0) {
                        continue;
                    }
                    
                    // Collect all keyframe data first before any modifications
                    var keyframeDataArray = [];
                    for (var keyIdx = 0; keyIdx < keyframeTimes.length; keyIdx++) {
                        var oldFrame = keyframeTimes[keyIdx];
                        var keyframeId = keyframeIds[keyIdx];
                        var exactNewFrame = oldFrame * ratio;  // Keep exact value for collision resolution
                        var newFrame = Math.round(exactNewFrame);
                        
                        var keyframeInfo = {
                            oldFrame: oldFrame,
                            exactNewFrame: exactNewFrame,  // Store exact value
                            newFrame: newFrame,
                            keyframeId: keyframeId,
                            keyData: null
                        };
                        
                        // Get keyframe data including interpolation type and bezier handles
                        try {
                            keyframeInfo.keyData = api.get(keyframeId, 'data');
                        } catch (e) {
                            // Could not get keyframe data
                        }
                        
                        keyframeDataArray.push(keyframeInfo);
                    }
                    
                    // Smart collision resolution: gives each frame to the keyframe closest to it
                    // This prevents keyframes from swapping order due to rounding
                    for (var keyIdx = 1; keyIdx < keyframeDataArray.length; keyIdx++) {
                        var prevKey = keyframeDataArray[keyIdx - 1];
                        var currKey = keyframeDataArray[keyIdx];
                        
                        // If current frame is not after previous frame (collision or reversal)
                        if (currKey.newFrame <= prevKey.newFrame) {
                            // Calculate which keyframe is closer to the contested frame
                            var prevDistance = Math.abs(prevKey.newFrame - prevKey.exactNewFrame);
                            var currDistance = Math.abs(currKey.newFrame - currKey.exactNewFrame);
                            
                            // If previous keyframe is closer or equal, push current forward
                            if (prevDistance <= currDistance) {
                                currKey.newFrame = prevKey.newFrame + 1;
                            } else {
                                // Current keyframe is closer, so push previous backward
                                // We need to push previous backward and check for chain collisions
                                prevKey.newFrame = currKey.newFrame - 1;
                                
                                // Cascade the change backward to maintain sequence
                                for (var backIdx = keyIdx - 1; backIdx > 0; backIdx--) {
                                    var checkPrev = keyframeDataArray[backIdx - 1];
                                    var checkCurr = keyframeDataArray[backIdx];
                                    if (checkCurr.newFrame <= checkPrev.newFrame) {
                                        checkCurr.newFrame = checkPrev.newFrame + 1;
                                    }
                                }
                            }
                        }
                    }
                    
                    // Now process all keyframes - move them first
                    for (var keyIdx = keyframeDataArray.length - 1; keyIdx >= 0; keyIdx--) {
                        var keyInfo = keyframeDataArray[keyIdx];
                        
                        // Move the keyframe
                        var modifyObj = {};
                        modifyObj[attrId] = {
                            "frame": keyInfo.oldFrame,
                            "newFrame": keyInfo.newFrame
                        };
                        api.modifyKeyframe(layerId, modifyObj);
                        totalKeyframes++;
                    }

                    // Values that are themselves in frames (or per frame) scale too. Keyframing an
                    // existing frame overwrites its value; the handles are rewritten below.
                    for (var keyIdx = 0; keyIdx < keyframeDataArray.length; keyIdx++) {
                        var valueKey = keyframeDataArray[keyIdx];
                        var hasValue = valueKey.keyData && typeof valueKey.keyData.numValue === "number";
                        valueKey.newValue = hasValue ? valueKey.keyData.numValue * valueScale : undefined;
                        if (valueScale !== 1 && hasValue) {
                            var valueObj = {};
                            valueObj[attrId] = valueKey.newValue;
                            api.keyframe(layerId, valueKey.newFrame, valueObj);
                        }
                    }

                    // Preserve easing: scale bezier handles along the TIME axis only.
                    //
                    // A frame rate change is a pure scale of the time axis - keyframe values
                    // never change, so the handles' Y components must not change either.
                    // Scaling only X by each segment's own duration ratio reproduces the
                    // identical curve shape (and therefore the identical motion path, since
                    // position.x and position.y are independent curves whose shared timing is
                    // what defines the path). Per-segment ratios also absorb the rounding
                    // applied above, so a segment that landed 1 frame short still eases right.
                    //
                    // Handles are addressed by layer + frame via api.modifyKeyframeTangent();
                    // keyframe IDs captured before the move are stale and must not be reused.
                    for (var keyIdx = 0; keyIdx < keyframeDataArray.length - 1; keyIdx++) {
                        var currentKeyInfo = keyframeDataArray[keyIdx];
                        var nextKeyInfo = keyframeDataArray[keyIdx + 1];

                        var oldDuration = nextKeyInfo.oldFrame - currentKeyInfo.oldFrame;
                        var newDuration = nextKeyInfo.newFrame - currentKeyInfo.newFrame;
                        if (oldDuration <= 0) {
                            continue;
                        }
                        var timeScale = newDuration / oldDuration;

                        // Outgoing handle of the current keyframe (interpolation 0 = bezier)
                        if (currentKeyInfo.keyData && currentKeyInfo.keyData.interpolation === 0 &&
                            currentKeyInfo.keyData.rightBez) {
                            try {
                                var outBez = currentKeyInfo.keyData.rightBez;
                                var outTangent = {};
                                outTangent[attrId] = {
                                    "frame": currentKeyInfo.newFrame,
                                    "inHandle": false,
                                    "outHandle": true,
                                    "xValue": currentKeyInfo.newFrame + (outBez.x * timeScale),
                                    "yValue": currentKeyInfo.newValue + outBez.y * valueScale,
                                    "angleLocked": !!currentKeyInfo.keyData.locked,
                                    "weightLocked": !!currentKeyInfo.keyData.weightLocked
                                };
                                api.modifyKeyframeTangent(layerId, outTangent);
                            } catch (e) {
                                // Handle modification can fail on locked or expression-driven keys
                            }
                        }

                        // Incoming handle of the next keyframe
                        if (nextKeyInfo.keyData && nextKeyInfo.keyData.interpolation === 0 &&
                            nextKeyInfo.keyData.leftBez) {
                            try {
                                var inBez = nextKeyInfo.keyData.leftBez;
                                var inTangent = {};
                                inTangent[attrId] = {
                                    "frame": nextKeyInfo.newFrame,
                                    "inHandle": true,
                                    "outHandle": false,
                                    "xValue": nextKeyInfo.newFrame + (inBez.x * timeScale),
                                    "yValue": nextKeyInfo.newValue + inBez.y * valueScale,
                                    "angleLocked": !!nextKeyInfo.keyData.locked,
                                    "weightLocked": !!nextKeyInfo.keyData.weightLocked
                                };
                                api.modifyKeyframeTangent(layerId, inTangent);
                            } catch (e) {
                                // Handle modification can fail on locked or expression-driven keys
                            }
                        }
                    }

                } catch (e) {
                    // Error processing attribute
                }
            }
            
            processedLayers++;
        }
        
        // Convert static (un-keyframed) attributes that are measured in frames.
        // Keyframed versions of these were already retimed by the pass above, so each
        // one is skipped when it has keyframes.
        console.log("=== Converting frame-based Attributes ===");
        for (var i = 0; i < allLayers.length; i++) {
            var layerId = allLayers[i];
            if (!api.layerExists(layerId)) {
                continue;
            }

            var layerType;
            try {
                layerType = api.getLayerType(layerId);
            } catch (e) {
                continue;
            }

            // JavaScript layers can do their own frame maths (time / 30 and so on), which can't be
            // read reliably - list them so they can be checked by hand.
            if (layerType.indexOf("javaScript") === 0) {
                var jsName = layerId;
                try { jsName = api.getNiceName(layerId); } catch (e) {}
                layersToCheck++;
                console.warn("  - Check " + jsName + " (" + layerType + "): any frame maths in its code isn't converted");
            }

            var frameAttrs = FRAME_ATTRIBUTES[layerType];
            if (frameAttrs) {
                for (var f = 0; f < frameAttrs.length; f++) {
                    scaleFrameAttribute(layerId, frameAttrs[f], ratio);
                }
            }
            for (var f = 0; f < ANY_LAYER_FRAME_ATTRIBUTES.length; f++) {
                scaleFrameAttribute(layerId, ANY_LAYER_FRAME_ATTRIBUTES[f], ratio);
            }
            var rateAttrs = PER_FRAME_RATE_ATTRIBUTES[layerType];
            if (rateAttrs) {
                for (var f = 0; f < rateAttrs.length; f++) {
                    scaleFrameAttribute(layerId, rateAttrs[f], 1 / ratio, true);
                }
            }

            // Pre-Comp: its contents retime themselves, but where it starts in this Composition
            // is counted in this Composition's frames. Same mechanism as footage below.
            if (layerType === "compositionReference") {
                try {
                    var refOffset = api.get(layerId, "timeOffset");
                    var refDelta = Math.round(refOffset * ratio) - refOffset;
                    if (refDelta !== 0) {
                        offsetLayerTimeKeepKeys(layerId, refDelta);
                        console.log("  - " + layerId + " Pre-Comp offset: " + refOffset + " → " + Math.round(refOffset * ratio));
                    }
                } catch (e) {
                    console.log("  - Error retiming Pre-Comp " + layerId + ": " + e.message);
                }
            }

            // Image Shader: where footage sits in time, and how fast it plays.
            //
            // The shader resolves a footage frame from the Composition's Time plus its own
            // Time Offset, so that offset is in Composition frames and has to scale with them.
            // Leaving it behind is what makes footage drift out of sync while everything
            // around it retimes correctly.
            //
            // Time Offset ignores api.set - it's a read-back of the layer's position in time,
            // moved with api.offsetLayerTime(). That call also slides the host layer's in/out
            // points, which is why they're restored from inOutPlan at the end of the conversion.
            //
            // The playback rate needs no work when Use Footage FPS is on (the default in
            // current Cavalry) - the footage runs at its native rate whatever the Composition
            // does. With it off, FPS is connected to the Composition's Frame Rate, so changing
            // the Composition drags footage speed with it and the shot plays slow or fast.
            // Break that connection and pin FPS to the rate it was playing at beforehand.
            if (layerType === "imageShader") {
                try {
                    var timeOffset = api.get(layerId, "timeOffset");
                    var offsetDelta = Math.round(timeOffset * ratio) - timeOffset;
                    if (offsetDelta !== 0) {
                        offsetLayerTimeKeepKeys(layerId, offsetDelta);
                        console.log("  - " + layerId + " footage offset: " + timeOffset + " → " + Math.round(timeOffset * ratio));
                    }

                    if (!api.get(layerId, "useFootageFps") &&
                        api.getInConnection(layerId, "fps") === activeComp + ".fps") {
                        api.disconnectInput(layerId, "fps");
                        api.set(layerId, {"fps": currentFps});
                        console.log("  - " + layerId + " FPS pinned to " + currentFps + " (was following the Composition)");
                    }
                } catch (e) {
                    console.log("  - Error retiming Image Shader " + layerId + ": " + e.message);
                }
            }

            // Frame behaviour: only frame-based mode needs converting (mode 1 is Seconds).
            // `value` is a per-frame increment so it scales inversely; the rest are frame counts.
            if (layerType === "frame") {
                try {
                    var interpMode = api.get(layerId, "mode");
                    if (interpMode === 0) {
                        scaleFrameAttribute(layerId, "value", 1 / ratio, true);
                        scaleFrameAttribute(layerId, "offset", ratio);
                        scaleFrameAttribute(layerId, "startFrame", ratio);
                        scaleFrameAttribute(layerId, "cycleLength", ratio);
                    }
                } catch (e) {
                    console.log("  - Error processing Frame behaviour " + layerId + ": " + e.message);
                }
            }

            // Oscillator: frequency is a rate in seconds/BPM either way, so it never scales.
            // Its timeOffset is in frames and is covered by FRAME_ATTRIBUTES.
        }

        // Write the layer in/out points recorded at the start. Doing it last means the slide
        // caused by offsetting footage time gets overwritten with the correct values, and
        // host/child layers that share one set of points simply agree on the same target.
        for (var i = 0; i < inOutPlan.length; i++) {
            var plan = inOutPlan[i];
            try {
                var newInFrame = Math.round(plan.inFrame * ratio);

                // api.getOutFrame() reports the frame after the last one the layer covers,
                // but api.setOutFrame() takes the last covered frame - so writing back what
                // was read makes every trimmed layer one frame longer, every conversion.
                var newOutFrame = Math.round(plan.outFrame * ratio) - 1;

                // Order matters: an in point can never be set past the current out point
                // (and vice versa), so move the one that leads the way first. Getting this
                // backwards silently leaves the in point at its old value.
                if (ratio > 1) {
                    api.setOutFrame(plan.layerId, newOutFrame);
                    api.setInFrame(plan.layerId, newInFrame);
                } else {
                    api.setInFrame(plan.layerId, newInFrame);
                    api.setOutFrame(plan.layerId, newOutFrame);
                }
            } catch (e) {
                // In/out points can be locked or driven, in which case there's nothing to do
            }
        }

        // Update the composition frame rate
        try {
            api.set(activeComp, {"fps": targetFps});
            console.log("Frame rate changed from " + currentFps + " to " + targetFps + " fps");
        } catch(e) {
            // Error updating comp frame rate
        }
        
        
        // Update composition frame range to maintain duration
        try {
            var newStartFrame = Math.round(currentStartFrame * ratio);
            var newEndFrame = Math.round(currentEndFrame * ratio);
            api.set(activeComp, {"startFrame": newStartFrame, "endFrame": newEndFrame});
        } catch(e) {
            // Error updating composition frame range
        }
        
        // Update playback range (timeline bookends) to maintain duration
        try {
            // Always update playback range if it exists, regardless of whether it matches frame range
            if (currentPlaybackStart !== undefined && currentPlaybackEnd !== undefined && 
                currentPlaybackStart !== null && currentPlaybackEnd !== null) {
                var newPlaybackStart = Math.round(currentPlaybackStart * ratio);
                var newPlaybackEnd = Math.round(currentPlaybackEnd * ratio);
                
                api.set(activeComp, {"playbackStart": newPlaybackStart, "playbackEnd": newPlaybackEnd});
            }
        } catch(e) {
            // Playback range might not be available in all Cavalry versions, so this is not critical
        }
        
        // Update current fps for next conversion
        currentFps = targetFps;
        
        // Restore playhead position (convert to new frame rate)
        try {
            var newPlayheadFrame = Math.round(currentPlayheadFrame * ratio);
            api.setFrame(newPlayheadFrame);
            console.log("Playhead moved from frame " + currentPlayheadFrame + " to frame " + newPlayheadFrame);
        } catch(e) {
            console.log("Could not restore playhead position");
        }

        return { from: fromFps, to: targetFps, keys: totalKeyframes, checks: layersToCheck };
        
    } catch (e) {
        // Conversion error - still try to restore playhead if possible
        try {
            api.setFrame(currentPlayheadFrame);
        } catch(e2) {
            // Could not restore playhead
        }
        console.error("Convert Frame Rate: " + (e && e.stack || e));
        return "Failed: " + (e && e.message || e);
    }
}

// Script execution complete - conversion has been performed