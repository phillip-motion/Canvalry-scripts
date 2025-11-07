// Convert Frame Rate for Cavalry
// Converts frame rate while maintaining visual timing of animations and easing curves
// Developed with assistance from Cursor
//
// Proper bezier handle conversion for frame rate changes
// This script preserves the exact visual easing when converting between frame rates
// by extracting cubic bezier values and reapplying them to new frame timing.
//
// KEY LEARNINGS ABOUT CAVALRY EASING:
// 1. Use api.modifyKeyframeTangent() for reliable bezier handle modification
// 2. Get fresh keyframe IDs after moving keyframes (original IDs become invalid)
// 3. Convert Cavalry bezier format ↔ cubic-bezier format for proper scaling
// 4. Process keyframes in pairs to maintain easing relationships
// 5. Handle multiple attributes/layers simultaneously

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
var currentVersion = "1.0.0";

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

// Create the UI with text input and Apply button
function createUI() {
    // Set the window title
    ui.setTitle("Convert Frame Rate");
    
    // Add current FPS info label
    
    // Add spacing
    // ui.addSpacing(10);
    
    // Add label for input
    
    // Add text input field
    var hLayout1 = new ui.HLayout();
    var fpsInput = new ui.LineEdit();
    fpsInput.setPlaceholder("Enter new frame rate...");
    hLayout1.add(fpsInput);
    
    
    // Add Apply button
    var applyButton = new ui.Button("Apply");

    applyButton.onClick = function() {
        var newFpsString = fpsInput.getText().trim();
        
        // Validate input
        if (!newFpsString || newFpsString === "") {
            console.log("Please enter a frame rate value.");
            return;
        }
        
        var newFps = parseFloat(newFpsString);
        if (isNaN(newFps) || newFps <= 0 || newFps > 120) {
            console.log("Error: Invalid frame rate. Please enter a number between 1 and 120.");
            return;
        }
        
        
        // Proceed with conversion
        convertFrameRate(newFps);
    };
    hLayout1.add(applyButton);
    ui.add(hLayout1);

    var instructions = new ui.Label("NOTE: Modifiers and procedural elements need manual adjustment.");
    instructions.setTextColor(ui.getThemeColor("Light"));
    ui.add(instructions);

    ui.addStretch();

    
    // Show the UI
    ui.show();
}

// Execute main function
main();

// Main conversion function
function convertFrameRate(targetFps) {
    activeComp = api.getActiveComp();
    if (!activeComp) {
        console.log("Error: No active composition found");
        return;
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
        var ratio = targetFps / currentFps;
        
        // Store current playhead position to restore later
        var currentPlayheadFrame = api.getFrame();
        
        // Get all layers in the composition
        var allLayers = [];
        try {
            allLayers = api.getCompLayers(false); // false = get all layers including children
        } catch(e) {
            return;
        }
        
        var processedLayers = 0;
        var totalKeyframes = 0;
        
        // Process each layer
        for (var i = 0; i < allLayers.length; i++) {
            var layerId = allLayers[i];
            
            // Check if layer exists
            if (!api.layerExists(layerId)) {
                continue;
            }
            
            // Convert layer in/out points
            try {
                var inFrame = api.getInFrame(layerId);
                var outFrame = api.getOutFrame(layerId);
                var compEndFrame = api.get(activeComp, "endFrame");
                
                // Only convert if the layer has custom in/out points
                if (inFrame !== 0 || outFrame !== compEndFrame) {
                    var newInFrame = Math.round(inFrame * ratio);
                    var newOutFrame = Math.round(outFrame * ratio);
                    
                    api.setInFrame(layerId, newInFrame);
                    api.setOutFrame(layerId, newOutFrame);
                }
            } catch (e) {
                // Some layers might not have in/out frames
            }
            
            // Get all animated attributes for this layer
            var animatedAttrs = [];
            try {
                animatedAttrs = api.getAnimatedAttributes(layerId);
            } catch(e) {
                continue;
            }
            
            // Process each animated attribute
            for (var attrIdx = 0; attrIdx < animatedAttrs.length; attrIdx++) {
                var attrId = animatedAttrs[attrIdx];
                
                try {
                    // Get keyframe times and IDs for this attribute
                    var keyframeTimes = api.getKeyframeTimes(layerId, attrId);
                    var keyframeIds = api.getKeyframeIdsForAttribute(layerId, attrId);
                    
                    if (!keyframeTimes || keyframeTimes.length === 0) {
                        continue;
                    }
                    
                    if (keyframeTimes.length < 2) {
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
                    
                    // CRITICAL: Fix bezier handles to preserve easing curves when frame rate changes
                    // 
                    // PROBLEM: Simply scaling bezier handles by the frame rate ratio doesn't work because:
                    // 1. Keyframe IDs become invalid after moving keyframes
                    // 2. Bezier handles need to maintain their cubic bezier curve shape
                    // 3. Direct scaling distorts the easing feel
                    //
                    // SOLUTION: Extract cubic bezier values, then reapply them to new frame timing
                    // This preserves the exact visual easing while adapting to new frame rates
                    
                    // Get fresh keyframe data after the move operations
                    // IMPORTANT: Original keyframe IDs are invalid after api.modifyKeyframe() calls
                    var freshKeyframeTimes = api.getKeyframeTimes(layerId, attrId);
                    var freshKeyframeIds = api.getKeyframeIdsForAttribute(layerId, attrId);
                    
                    // Process keyframes in pairs to extract and reapply cubic bezier easing
                    for (var keyIdx = 0; keyIdx < keyframeDataArray.length - 1; keyIdx++) {
                        var currentKeyInfo = keyframeDataArray[keyIdx];
                        var nextKeyInfo = keyframeDataArray[keyIdx + 1];
                        
                        // Find the fresh keyframe IDs for the moved keyframes
                        // We need to match the new frame positions to get valid keyframe IDs
                        var currentFreshId = null;
                        var nextFreshId = null;
                        
                        for (var freshIdx = 0; freshIdx < freshKeyframeTimes.length; freshIdx++) {
                            if (freshKeyframeTimes[freshIdx] === currentKeyInfo.newFrame) {
                                currentFreshId = freshKeyframeIds[freshIdx];
                            }
                            if (freshKeyframeTimes[freshIdx] === nextKeyInfo.newFrame) {
                                nextFreshId = freshKeyframeIds[freshIdx];
                            }
                        }
                        
                        // Skip if we can't find valid keyframe IDs (shouldn't happen in normal cases)
                        if (!currentFreshId || !nextFreshId) {
                            continue;
                        }
                        
                        // Only process bezier interpolation pairs
                        if (currentKeyInfo.keyData && currentKeyInfo.keyData.interpolation === 0 &&
                            nextKeyInfo.keyData && nextKeyInfo.keyData.interpolation === 0) {
                            
                            try {
                                // STEP 1: Extract cubic bezier values from original keyframes
                                // This converts Cavalry's internal bezier format to standard cubic-bezier values
                                var originalFrameDiff = nextKeyInfo.oldFrame - currentKeyInfo.oldFrame;
                                var originalValueDiff = nextKeyInfo.keyData.numValue - currentKeyInfo.keyData.numValue;
                                
                                // Get original bezier handles from keyframe data
                                // rightBez = outgoing handle from current keyframe
                                // leftBez = incoming handle to next keyframe
                                var outHandleX = currentKeyInfo.keyData.rightBez ? currentKeyInfo.keyData.rightBez.x : 0;
                                var outHandleY = currentKeyInfo.keyData.rightBez ? currentKeyInfo.keyData.rightBez.y : 0;
                                var inHandleX = nextKeyInfo.keyData.leftBez ? nextKeyInfo.keyData.leftBez.x : 0;
                                var inHandleY = nextKeyInfo.keyData.leftBez ? nextKeyInfo.keyData.leftBez.y : 0;
                                
                                // Convert to cubic bezier format (using Easey's proven conversion logic)
                                // This extracts the pure easing curve independent of frame timing
                                if (originalFrameDiff === 0) {
                                    continue; // Avoid division by zero
                                }
                                
                                // Standard cubic-bezier format: cubic-bezier(x1, y1, x2, y2)
                                // x1, x2 = time control points (0-1 range, but can exceed for extreme curves)
                                // y1, y2 = value control points (can be any value for overshoot/undershoot)
                                var x1 = outHandleX / originalFrameDiff;
                                var y1 = Math.abs(originalValueDiff) > 0.001 ? outHandleY / originalValueDiff : 0;
                                var x2 = (originalFrameDiff + inHandleX) / originalFrameDiff;
                                var y2 = Math.abs(originalValueDiff) > 0.001 ? 1 + (inHandleY / originalValueDiff) : 1;
                                
                                // STEP 2: Calculate new frame and value differences for the converted keyframes
                                var newFrameDiff = nextKeyInfo.newFrame - currentKeyInfo.newFrame;
                                var newValueDiff = nextKeyInfo.keyData.numValue - currentKeyInfo.keyData.numValue;
                                
                                // STEP 3: Convert cubic bezier back to Cavalry format with new frame timing
                                // This applies the same easing curve to the new frame duration
                                // Using Easey's proven cubicBezierToCavalry conversion logic
                                var newOutHandleX = x1 * newFrameDiff;        // Scale time control point to new duration
                                var newOutHandleY = y1 * newValueDiff;        // Scale value control point to new range
                                var newInHandleX = (x2 - 1) * newFrameDiff;   // Incoming handle is relative to end frame
                                var newInHandleY = (y2 - 1) * newValueDiff;   // Incoming handle value relative to end value
                                
                                // STEP 4: Apply new bezier handles using api.modifyKeyframeTangent()
                                // 
                                // CRITICAL API DISCOVERY: Use api.modifyKeyframeTangent(), not api.modifyKeyframe()
                                // - api.modifyKeyframe(id, 'rightBez.x', value) fails with "undefined" errors
                                // - api.modifyKeyframeTangent() works reliably (same method Easey uses)
                                // - Must use fresh keyframe IDs after moving keyframes (original IDs become invalid)
                                
                                // Set right handle (outgoing) for current keyframe
                                try {
                                    var tangentObj1 = {};
                                    tangentObj1[attrId] = {
                                        "frame": currentKeyInfo.newFrame,
                                        "inHandle": false,
                                        "outHandle": true,
                                        "xValue": currentKeyInfo.newFrame + newOutHandleX,  // Absolute position
                                        "yValue": currentKeyInfo.keyData.numValue + newOutHandleY,  // Absolute value
                                        "angleLocked": false,
                                        "weightLocked": false
                                    };
                                    api.modifyKeyframeTangent(layerId, tangentObj1);
                                } catch (e) {
                                    // Silently handle errors - bezier modification can fail for various reasons
                                }
                                
                                // Set left handle (incoming) for next keyframe
                                try {
                                    var tangentObj2 = {};
                                    tangentObj2[attrId] = {
                                        "frame": nextKeyInfo.newFrame,
                                        "inHandle": true,
                                        "outHandle": false,
                                        "xValue": nextKeyInfo.newFrame + newInHandleX,  // Absolute position
                                        "yValue": nextKeyInfo.keyData.numValue + newInHandleY,  // Absolute value
                                        "angleLocked": false,
                                        "weightLocked": false
                                    };
                                    api.modifyKeyframeTangent(layerId, tangentObj2);
                                } catch (e) {
                                    // Silently handle errors - bezier modification can fail for various reasons
                                }
                                
                            } catch (e) {
                                // Error processing bezier pair
                            }
                        }
                    }
                    
                } catch (e) {
                    // Error processing attribute
                }
            }
            
            processedLayers++;
        }
        
        // Convert Auto Animate timeOffset and Frame behavior properties
        // These need special handling as they affect timing but aren't keyframed attributes
        console.log("=== Checking for Auto Animate and Frame behaviors ===");
        for (var i = 0; i < allLayers.length; i++) {
            var layerId = allLayers[i];
            
            if (!api.layerExists(layerId)) {
                continue;
            }
            
            try {
                var layerType = api.getType(layerId);
                
                // Debug: log all layer types to see what we're dealing with
                if (layerType === "autoAnimate" || layerType === "frame") {
                    console.log("Found " + layerType + " layer: " + layerId);
                }
                
                // Handle Auto Animate deformer timeOffset
                if (layerType === "autoAnimate") {
                    console.log("Processing Auto Animate layer: " + layerId);
                    try {
                        // Check if timeOffset is animated (has keyframes)
                        var timeOffsetKeyframes = api.getKeyframeTimes(layerId, "timeOffset");
                        var isTimeOffsetAnimated = timeOffsetKeyframes && timeOffsetKeyframes.length > 0;
                        
                        // Only adjust if not animated (keyframes already handled)
                        if (!isTimeOffsetAnimated) {
                            var currentTimeOffset = api.get(layerId, "timeOffset");
                            var newTimeOffset = currentTimeOffset * ratio;
                            api.set(layerId, {"timeOffset": newTimeOffset});
                            console.log("  - Adjusted timeOffset: " + currentTimeOffset + " → " + newTimeOffset);
                        } else {
                            console.log("  - Skipped timeOffset (animated)");
                        }
                    } catch (e) {
                        console.log("  - Error adjusting timeOffset: " + e.message);
                    }
                }
                
                // Handle Frame behavior properties
                if (layerType === "frame") {
                    console.log("Processing Frame behavior: " + layerId);
                    try {
                        // Check interpolation mode - only process if mode is "Frame" (enum value 0 or not present)
                        // mode = 0: Frame (frame-based, needs conversion)
                        // mode = 1: Seconds (time-based, no conversion needed)
                        var interpMode;
                        try {
                            interpMode = api.get(layerId, "mode");
                        } catch (e) {
                            interpMode = 0; // Default to Frame mode if not present
                        }
                        
                        console.log("  - Interpolation mode: " + (interpMode === 0 ? "Frame" : "Seconds"));
                        
                        if (interpMode === 0) { // Frame mode
                            // Check which attributes are animated
                            var valueKeyframes = api.getKeyframeTimes(layerId, "value");
                            var offsetKeyframes = api.getKeyframeTimes(layerId, "offset");
                            var startFrameKeyframes = api.getKeyframeTimes(layerId, "startFrame");
                            
                            var isValueAnimated = valueKeyframes && valueKeyframes.length > 0;
                            var isOffsetAnimated = offsetKeyframes && offsetKeyframes.length > 0;
                            var isStartFrameAnimated = startFrameKeyframes && startFrameKeyframes.length > 0;
                            
                            // Adjust value (divide by ratio to maintain visual speed)
                            if (!isValueAnimated) {
                                try {
                                    var currentValue = api.get(layerId, "value");
                                    var newValue = currentValue / ratio;
                                    api.set(layerId, {"value": newValue});
                                    console.log("  - Adjusted value: " + currentValue + " → " + newValue);
                                } catch (e) {
                                    console.log("  - Error adjusting value: " + e.message);
                                }
                            } else {
                                console.log("  - Skipped value (animated)");
                            }
                            
                            // Adjust offset (multiply by ratio)
                            if (!isOffsetAnimated) {
                                try {
                                    var currentOffset = api.get(layerId, "offset");
                                    var newOffset = currentOffset * ratio;
                                    api.set(layerId, {"offset": newOffset});
                                    console.log("  - Adjusted offset: " + currentOffset + " → " + newOffset);
                                } catch (e) {
                                    console.log("  - Error adjusting offset: " + e.message);
                                }
                            } else {
                                console.log("  - Skipped offset (animated)");
                            }
                            
                            // Adjust startFrame (multiply by ratio)
                            if (!isStartFrameAnimated) {
                                try {
                                    var currentStartFrame = api.get(layerId, "startFrame");
                                    var newStartFrame = Math.round(currentStartFrame * ratio);
                                    api.set(layerId, {"startFrame": newStartFrame});
                                    console.log("  - Adjusted startFrame: " + currentStartFrame + " → " + newStartFrame);
                                } catch (e) {
                                    console.log("  - Error adjusting startFrame: " + e.message);
                                }
                            } else {
                                console.log("  - Skipped startFrame (animated)");
                            }
                        } else {
                            console.log("  - Skipped (mode is Seconds, not Frame)");
                        }
                    } catch (e) {
                        console.log("  - Error processing Frame behavior: " + e.message);
                    }
                }
            } catch (e) {
                // Could not get layer type - this is normal for most layers
            }
        }
        
        // Get current ranges BEFORE updating frame rate
        var currentStartFrame, currentEndFrame, currentPlaybackStart, currentPlaybackEnd;
        try {
            currentStartFrame = api.get(activeComp, "startFrame");
            currentEndFrame = api.get(activeComp, "endFrame");
            currentPlaybackStart = api.get(activeComp, "playbackStart");
            currentPlaybackEnd = api.get(activeComp, "playbackEnd");
        } catch(e) {
            // Error reading current ranges
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
        
    } catch (e) {
        // Conversion error - still try to restore playhead if possible
        try {
            api.setFrame(currentPlayheadFrame);
        } catch(e2) {
            // Could not restore playhead
        }
    }
}

// Script execution complete - conversion has been performed