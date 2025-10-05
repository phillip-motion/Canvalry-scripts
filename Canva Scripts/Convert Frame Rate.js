// Frame Rate Converter Plugin for Cavalry
// Converts frame rate while maintaining visual timing of animations and easing curves
//
// MAJOR BREAKTHROUGH: Proper bezier handle conversion for frame rate changes
// This script preserves the exact visual easing when converting between frame rates
// by extracting cubic bezier values and reapplying them to new frame timing.
//
// KEY LEARNINGS INTEGRATED FROM EASEY DEVELOPMENT:
// 1. Use api.modifyKeyframeTangent() for reliable bezier handle modification
// 2. Get fresh keyframe IDs after moving keyframes (original IDs become invalid)
// 3. Convert Cavalry bezier format ↔ cubic-bezier format for proper scaling
// 4. Process keyframes in pairs to maintain easing relationships
// 5. Handle multiple attributes/layers simultaneously

// Global variables for UI state
var currentFps = 25;
var activeComp = null;

// Main execution function
function main() {
    // Get active composition and current frame rate
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
    fpsInput.setPlaceholder(currentFps.toString());
    hLayout1.add(fpsInput);
    
    
    // Add Apply button
    var applyButton = new ui.Button("Apply");

    applyButton.onClick = function() {
        // Refresh current FPS before each conversion
        try {
            currentFps = api.get(activeComp, "fps");
            if (!currentFps || currentFps <= 0) {
                currentFps = 25;
            }
        } catch(e) {
            console.log("Could not get current FPS, using previous value: " + currentFps);
        }
        
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
        
        if (newFps === currentFps) {
            console.log("New frame rate is the same as current frame rate (" + currentFps + " fps). No conversion needed.");
            return;
        }
        
        console.log("Converting from " + currentFps + " fps to " + newFps + " fps");
        
        // Proceed with conversion
        convertFrameRate(newFps, currentFps, activeComp);
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
function convertFrameRate(targetFps, currentFps, activeComp) {
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
                        var newFrame = Math.round(oldFrame * ratio);
                        
                        var keyframeInfo = {
                            oldFrame: oldFrame,
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