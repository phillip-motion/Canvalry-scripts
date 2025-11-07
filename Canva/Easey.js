// Easey - Advanced Cubic Bezier Easing Plugin for Cavalry
//
// INSTALLATION:
// 1. Save this file as "Easey.js" in your Cavalry scripts folder
// 2. Find the scripts folder via: Help > Show Scripts Folder (or Scripts > Show Scripts Folder)
// 3. Restart Cavalry or refresh the Scripts menu
// 4. Access via: Window > Scripts > Easey
//
// FEATURES:
// - Interactive bezier curve editor with visual handles
// - Shift+drag axis constraint for precise editing
// - Multi-attribute keyframe support (apply to multiple layers/properties at once)
// - Preset management with alphabetical sorting
// - Context menu integration for keyframe analysis
// - Persistent preset storage with proper deletion handling
//
// CAVALRY API DISCOVERIES & LESSONS LEARNED:
//
// 1. MODIFIER KEY DETECTION:
//    - Mouse event 'modifiers' parameter is undefined in Cavalry
//    - Solution: Use api.isShiftHeld() for reliable shift key detection
//    - Reference: https://docs.cavalry.scenegroup.co/tech-info/scripting/api-module/#isshiftheld
//
// 2. KEYFRAME SELECTION HANDLING:
//    - api.getSelectedKeyframes() returns object with full attribute paths as keys
//    - api.getAttributeFromKeyframeId() returns FULL path (e.g., "basicShape#1.position.x")
//    - Key insight: Match keyframe IDs to attribute paths using full paths, not partial
//
// 3. MULTI-ATTRIBUTE KEYFRAME PROCESSING:
//    - Can process keyframes across different layers and properties simultaneously
//    - Group by full attribute path, then process each group independently
//    - Each attribute group needs separate unlocking and easing application
//
// 4. HANDLE BOUNDS & CLICK DETECTION:
//    - Visual handle positions and click targets can desync when dragging outside bounds
//    - Solution: Clamp visual positions for both drawing AND click detection consistently
//    - Allow easing values beyond 0-1 range while keeping handles clickable
//
// 5. PRESET PERSISTENCE:
//    - Default presets get re-added on script reload unless properly handled
//    - Solution: Replace entire presets object with saved data, not merge
//    - Use api.setPreferenceObject() and api.getPreferenceObject() for persistence
//
// 6. AXIS CONSTRAINT IMPLEMENTATION:
//    - Calculate handle angle from proper origin points (cp1: 0,0 | cp2: 1,1)
//    - Snap coordinate to grid boundary, then constrain mouse movement to other axis
//    - Recalculate constraint direction when shift is re-pressed during same drag
//
// USAGE:
// 1. Select keyframes in the Graph Editor or Time Editor (supports multiple attributes)
// 2. Use the interactive graph to adjust easing curve
// 3. Hold Shift while dragging handles for axis-constrained movement
// 4. Click Apply to apply the easing to selected keyframes
// 5. Use Get button to extract easing from selected keyframes
// 6. Right-click preset area for context menu options
// 7. Use context menu items to copy keyframe duration, values, and easing info

// Set the window title
ui.setTitle("Easey");

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
var scriptName = "Easey";  // Must match key your repo's versions.json
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

// Global variables for the easing curve
var currentEasing = {
    x1: 0.5,
    y1: 0.0,
    x2: 0.0,
    y2: 1.0
};

var presets = {
    "cubic-in": { x1: 0.55, y1: 0.055, x2: 0.675, y2: 0.19 },
    "cubic-out": { x1: 0.215, y1: 0.61, x2: 0.355, y1: 1 },
    "cubic-in-out": { x1: 0.645, y1: 0.045, x2: 0.355, y2: 1 },
    "quart-in": { x1: 0.895, y1: 0.03, x2: 0.685, y2: 0.22 },
    "quart-out": { x1: 0.165, y1: 0.84, x2: 0.44, y2: 1 },
    "quart-in-out": { x1: 0.77, y1: 0, x2: 0.175, y2: 1 },
    "quint-in": { x1: 0.755, y1: 0.05, x2: 0.855, y2: 0.06 },
    "quint-out": { x1: 0.23, y1: 1, x2: 0.32, y2: 1 },
    "quint-in-out": { x1: 0.86, y1: 0, x2: 0.07, y2: 1 },
    "expo-in": { x1: 0.95, y1: 0.05, x2: 0.795, y2: 0.035 }
};

// Graph variables
var graphWidth = 230;
var graphHeight = 230;
var graphPadding = 40; // Increased padding for more room
var isDragging = false;
var dragHandle = null;
var handleRadius = 6;

// Speed graph variables
var speedGraphWidth = 230;
var speedGraphHeight = 230;
var speedGraphPadding = 40;
var speedDragging = false;
var speedDragHandle = null; // 'out' or 'in'
var speedHandleRadius = 6;

// Speed graph state (percentages 0-100)
var speedEasing = {
    outInfluence: 33,  // Default 33%
    inInfluence: 33    // Default 33%
};

// Backup Y values when switching to Speed tab (for restoration if unmodified)
var backupYValues = null;
var speedGraphModified = false;

// Shift+drag axis constraint variables
// IMPLEMENTATION NOTES:
// - dragStartPosition: Initial mouse position when drag began (for mouse constraint)
// - dragStartEasing: Initial easing values when drag began (for angle calculation)
// - axisConstraint: 'x' = allow X movement, 'y' = allow Y movement, null = free movement
// 
// KEY DISCOVERY: Constraint logic is inverse of what you might expect:
// - When handle is closer to horizontal (< 45°): snap Y coordinate, allow X movement
// - When handle is closer to vertical (≥ 45°): snap X coordinate, allow Y movement
// - This allows movement ALONG the axis you snap TO, which feels more natural
var dragStartPosition = null;
var dragStartEasing = null;
var axisConstraint = null; // 'x', 'y', or null

// Apply on drag state
var applyOnDragEnabled = false;

// Flag to prevent dropdown reset during programmatic updates
var isUpdatingFromPreset = false;

// Flag to prevent text input callback loop during programmatic updates
var isUpdatingTextInput = false;

// Create main UI elements
var graphCanvas = new ui.Draw();
graphCanvas.setSize(graphWidth, graphHeight);

// Create speed graph canvas
var speedGraphCanvas = new ui.Draw();
speedGraphCanvas.setSize(speedGraphWidth, speedGraphHeight);

// Keyboard event handlers are added at the end of the script on the main UI

// Main action buttons
var applyButton = new ui.ImageButton(ui.scriptLocation+"/easey_assets/icon-apply.png");
applyButton.setToolTip("Apply easing");
applyButton.setImageSize(16,16);
applyButton.setSize(24, 24);
var getButton = new ui.ImageButton(ui.scriptLocation+"/easey_assets/icon-get.png");
getButton.setToolTip("Get easing from keyframes");
getButton.setImageSize(16,16);
getButton.setSize(24, 24);


// Context menu button for main actions
var mainContextButton = new ui.Button("⋯");
mainContextButton.setSize(18, 18);

// Create text input for cubic bezier values
var bezierInput = new ui.LineEdit();
bezierInput.setText("0.25, 0.1, 0.25, 1.0");

// Create preset section
var presetList = new ui.DropDown();

// Context menu button for preset actions
var presetContextButton = new ui.ImageButton(ui.scriptLocation+"/easey_assets/icon-settings.png");
presetContextButton.setDrawStroke(false);
presetContextButton.setToolTip("Settings");
presetContextButton.setImageSize(16,16);
presetContextButton.setSize(18, 18);

// Export/Import functionality (will be added to dropdown menu)


// Helper function to get composition frame rate
function getCompositionFrameRate() {
    try {
        var activeCompId = api.getActiveComp();
        var frameRate = api.get(activeCompId, "fps");
        
        if (frameRate === undefined || frameRate === null || typeof frameRate !== 'number' || frameRate <= 0) {
            throw new Error("Invalid frame rate value: " + frameRate);
        }
        
        return frameRate;
    } catch (e) {
        throw new Error("Failed to get composition frame rate: " + e.message);
    }
}

// Helper function to convert cubic bezier to Cavalry format
function cubicBezierToCavalry(x1, y1, x2, y2, frameDiff, valueDiff) {
    // Convert from cubic-bezier format to Cavalry's internal format
    // Based on the expected values, the Y calculation needs to be different
    
    var outHandleX = x1 * frameDiff;
    var outHandleY = y1 * valueDiff;
    var inHandleX = (x2 - 1) * frameDiff;
    var inHandleY = (y2 - 1) * valueDiff;
    
    
    return {
        outHandleX: outHandleX,
        outHandleY: outHandleY,
        inHandleX: inHandleX,
        inHandleY: inHandleY
    };
}

// Helper function to convert Cavalry format to cubic bezier
function cavalryToCubicBezier(outHandleX, outHandleY, inHandleX, inHandleY, frameDiff, valueDiff) {
    var x1 = outHandleX / frameDiff;
    var y1 = Math.abs(valueDiff) > 0.001 ? outHandleY / valueDiff : 0;
    var x2 = (frameDiff + inHandleX) / frameDiff;
    var y2 = Math.abs(valueDiff) > 0.001 ? 1 + (inHandleY / valueDiff) : 1;
    
    // Allow values outside 0-1 range for more extreme easing curves
    // No clamping needed
    
    return {
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2
    };
}

// Convert speed percentages to cubic-bezier (with y=0 and y=1)
function speedToCubicBezier(outInfluence, inInfluence) {
    return {
        x1: outInfluence / 100,
        y1: 0,
        x2: 1 - (inInfluence / 100),
        y2: 1
    };
}

// Convert cubic-bezier to speed percentages (flatten y values)
function cubicBezierToSpeed(x1, y1, x2, y2) {
    return {
        outInfluence: x1 * 100,
        inInfluence: (1 - x2) * 100
    };
}

// Calculate velocity (dy/dx) at time t for cubic bezier curve
function calculateVelocityAtTime(t, x1, y1, x2, y2) {
    // Cubic bezier from (0,0) to (1,1) with control points (x1,y1) and (x2,y2)
    // We want dy/dx (rate of value change over time), not just dy/dt
    
    var oneMinusT = 1 - t;
    
    // Calculate dy/dt (rate of value change over curve parameter)
    var dy = 3 * oneMinusT * oneMinusT * y1 + 
             6 * oneMinusT * t * (y2 - y1) + 
             3 * t * t * (1 - y2);
    
    // Calculate dx/dt (rate of time change over curve parameter)
    var dx = 3 * oneMinusT * oneMinusT * x1 + 
             6 * oneMinusT * t * (x2 - x1) + 
             3 * t * t * (1 - x2);
    
    // Speed is dy/dx (avoid division by zero)
    var speed = Math.abs(dx) > 0.0001 ? Math.abs(dy / dx) : 0;
    
    return speed;
}

// Sample velocity curve at multiple points and return normalized values
function sampleVelocityCurve(x1, y1, x2, y2, sampleCount) {
    var samples = [];
    var maxSpeed = 0;
    
    // First pass: calculate all speeds and find maximum
    for (var i = 0; i <= sampleCount; i++) {
        var t = i / sampleCount;
        var speed = calculateVelocityAtTime(t, x1, y1, x2, y2);
        samples.push(speed);
        maxSpeed = Math.max(maxSpeed, speed);
    }
    
    // Second pass: normalize to 0-1 range
    // Handle edge case where maxSpeed is 0 (shouldn't happen with valid curves)
    if (maxSpeed < 0.0001) maxSpeed = 1;
    
    for (var i = 0; i < samples.length; i++) {
        samples[i] = samples[i] / maxSpeed;
    }
    
    return samples;
}

// Sync speed graph to value graph (and mark as modified)
function syncSpeedToValue() {
    var cubic = speedToCubicBezier(speedEasing.outInfluence, speedEasing.inInfluence);
    currentEasing.x1 = cubic.x1;
    currentEasing.y1 = cubic.y1;  // Always 0 in speed mode
    currentEasing.x2 = cubic.x2;
    currentEasing.y2 = cubic.y2;  // Always 1 in speed mode
    speedGraphModified = true; // Mark that speed graph was modified
    drawCurve();
}

// Sync value graph to speed graph
function syncValueToSpeed() {
    var speed = cubicBezierToSpeed(currentEasing.x1, currentEasing.y1, currentEasing.x2, currentEasing.y2);
    speedEasing.outInfluence = speed.outInfluence;
    speedEasing.inInfluence = speed.inInfluence;
    drawSpeedCurve();
}

// Draw the easing curve on the canvas
function drawCurve() {
    // Clear all paths
    graphCanvas.clearPaths();
    
    var width = graphWidth;
    var height = graphHeight;
    var padding = graphPadding;
    
    // Set background color
    graphCanvas.setBackgroundColor(ui.getThemeColor("AlternateBase"));
    
    // Create grid paths
    var gridPath = new cavalry.Path();
    
    // Vertical grid lines - extend to fill entire padded area
    for (var i = 0; i <= 10; i++) {
        var x = padding + (i * (width - 2 * padding) / 10);
        gridPath.moveTo(x, 0); // Start from top edge
        gridPath.lineTo(x, height); // End at bottom edge
    }
    
    // Horizontal grid lines - extend to fill entire padded area
    for (var i = 0; i <= 10; i++) {
        var y = padding + (i * (height - 2 * padding) / 10);
        gridPath.moveTo(0, y); // Start from left edge
        gridPath.lineTo(width, y); // End at right edge
    }
    
    // Add grid to canvas
    var gridPaint = {"color": "#3a3a3a", "stroke": true, "strokeWidth": 1};
    if (gridPath && gridPath.toObject) {
        graphCanvas.addPath(gridPath.toObject(), gridPaint);
    }
    
    // // Create axes path
    // var axesPath = new cavalry.Path();
    // axesPath.moveTo(padding, height - padding);
    // axesPath.lineTo(width - padding, height - padding);
    // axesPath.moveTo(padding, padding);
    // axesPath.lineTo(padding, height - padding);
    
    // var axesPaint = {"color": "#666666", "stroke": true, "strokeWidth": 2};
    // graphCanvas.addPath(axesPath.toObject(), axesPaint);
    
    // Create bezier curve path
    var curvePath = new cavalry.Path();
    var startX = padding;
    var startY = height - padding;
    var endX = width - padding;
    var endY = padding;
    
    // Ensure currentEasing has valid values
    var x1 = (currentEasing.x1 !== undefined) ? currentEasing.x1 : 0.25;
    var y1 = (currentEasing.y1 !== undefined) ? currentEasing.y1 : 0.1;
    var x2 = (currentEasing.x2 !== undefined) ? currentEasing.x2 : 0.25;
    var y2 = (currentEasing.y2 !== undefined) ? currentEasing.y2 : 1.0;
    
    // Control points - both handles positioned correctly for easing curve
    // Allow handles to go outside the graph bounds
    var cp1X = startX + x1 * (endX - startX);
    var cp1Y = endY + y1 * (startY - endY); // First handle (ease-in)
    var cp2X = startX + x2 * (endX - startX);
    var cp2Y = endY + y2 * (startY - endY); // Second handle (ease-out)
    
    // Clamp handle positions for drawing (so they stay visible)
    var visibleCp1X = Math.max(startX - 20, Math.min(endX + 20, cp1X));
    var visibleCp1Y = Math.max(endY - 20, Math.min(startY + 20, cp1Y));
    var visibleCp2X = Math.max(startX - 20, Math.min(endX + 20, cp2X));
    var visibleCp2Y = Math.max(endY - 20, Math.min(startY + 20, cp2Y));
    
    // Draw the bezier curve (from bottom-left to top-right)
    curvePath.moveTo(startX, endY); // Start at bottom-left (0,0)
    curvePath.cubicTo(cp1X, cp1Y, cp2X, cp2Y, endX, startY); // End at top-right (1,1)
    
    var curvePaint = {"color": "#ffffff", "stroke": true, "strokeWidth": 2};
    if (curvePath && curvePath.toObject) {
        graphCanvas.addPath(curvePath.toObject(), curvePaint);
    }
    
    // Create control handles (use visible positions for drawing)
    var handle1Path = new cavalry.Path();
    handle1Path.addEllipse(visibleCp1X, visibleCp1Y, 6, 6);
    
    var handle2Path = new cavalry.Path();
    handle2Path.addEllipse(visibleCp2X, visibleCp2Y, 6, 6);
    
    var handlePaint = {"color": ui.getThemeColor("Accent1"), "stroke": false};
    if (handle1Path && handle1Path.toObject) {
        graphCanvas.addPath(handle1Path.toObject(), handlePaint);
    }
    if (handle2Path && handle2Path.toObject) {
        graphCanvas.addPath(handle2Path.toObject(), handlePaint);
    }
    
    // Create control lines (use visible positions for drawing)
    var controlPath = new cavalry.Path();
    controlPath.moveTo(startX, endY); // Start point (bottom-left)
    controlPath.lineTo(visibleCp1X, visibleCp1Y);
    controlPath.moveTo(endX, startY); // End point (top-right)
    controlPath.lineTo(visibleCp2X, visibleCp2Y);
    
    var controlPaint = {"color": ui.getThemeColor("Accent1"), "stroke": true, "strokeWidth": 1};
    if (controlPath && controlPath.toObject) {
        graphCanvas.addPath(controlPath.toObject(), controlPaint);
    }
    
    // Trigger redraw
    graphCanvas.redraw();
}

// Draw the speed curve on the speed graph canvas (velocity-based)
function drawSpeedCurve() {
    speedGraphCanvas.clearPaths();
    
    var width = speedGraphWidth;
    var height = speedGraphHeight;
    var padding = speedGraphPadding;
    
    speedGraphCanvas.setBackgroundColor(ui.getThemeColor("AlternateBase"));
    
    // Draw grid
    var gridPath = new cavalry.Path();
    for (var i = 0; i <= 10; i++) {
        var x = padding + (i * (width - 2 * padding) / 10);
        gridPath.moveTo(x, 0);
        gridPath.lineTo(x, height);
    }
    for (var i = 0; i <= 10; i++) {
        var y = padding + (i * (height - 2 * padding) / 10);
        gridPath.moveTo(0, y);
        gridPath.lineTo(width, y);
    }
    var gridPaint = {"color": "#3a3a3a", "stroke": true, "strokeWidth": 1};
    if (gridPath && gridPath.toObject) {
        speedGraphCanvas.addPath(gridPath.toObject(), gridPaint);
    }
    
    // Graph coordinates
    var startX = padding;
    var startY = height - padding;  // Bottom
    var endX = width - padding;
    var endY = padding;              // Top
    var midX = startX + (endX - startX) / 2;
    
    // Get current cubic-bezier values directly from currentEasing
    // This ensures the velocity curve uses the same values shown in the text input
    var x1 = currentEasing.x1;
    var y1 = currentEasing.y1;
    var x2 = currentEasing.x2;
    var y2 = currentEasing.y2;
    
    // Clamp x values for velocity calculation to avoid extreme divisions
    // This prevents visual artifacts at x1=1.0, x2=0.0 while keeping actual values intact
    var x1Clamped = Math.min(0.999, Math.max(0.001, x1));
    var x2Clamped = Math.min(0.999, Math.max(0.001, x2));
    
    // Sample velocity curve (50 samples for smooth curve)
    var sampleCount = 50;
    var velocitySamples = sampleVelocityCurve(x1Clamped, y1, x2Clamped, y2, sampleCount);
    
    // Draw velocity curve
    var curvePath = new cavalry.Path();
    var graphHeight = startY - endY;
    
    // Start at first sample
    var firstX = startX;
    var firstY = endY + (velocitySamples[0] * graphHeight);
    curvePath.moveTo(firstX, firstY);
    
    // Draw line through all samples
    for (var i = 1; i <= sampleCount; i++) {
        var t = i / sampleCount;
        var sampleX = startX + t * (endX - startX);
        var sampleY = endY + (velocitySamples[i] * graphHeight);
        curvePath.lineTo(sampleX, sampleY);
    }
    
    var curvePaint = {"color": "#ffffff", "stroke": true, "strokeWidth": 2};
    speedGraphCanvas.addPath(curvePath.toObject(), curvePaint);
    
    // Calculate handle positions on X-axis (bottom corners)
    var outHandleX = startX + (speedEasing.outInfluence / 100) * (midX - startX);
    var inHandleX = endX - (speedEasing.inInfluence / 100) * (endX - midX);
    
    // Draw handles at bottom corners
    var handle1Path = new cavalry.Path();
    handle1Path.addEllipse(outHandleX, endY, 6, 6);
    
    var handle2Path = new cavalry.Path();
    handle2Path.addEllipse(inHandleX, endY, 6, 6);
    
    var handlePaint = {"color": ui.getThemeColor("Accent1"), "stroke": false};
    speedGraphCanvas.addPath(handle1Path.toObject(), handlePaint);
    speedGraphCanvas.addPath(handle2Path.toObject(), handlePaint);
    
    // Draw horizontal lines along bottom corners
    var linePath = new cavalry.Path();
    linePath.moveTo(startX, endY);
    linePath.lineTo(outHandleX, endY);
    linePath.moveTo(inHandleX, endY);
    linePath.lineTo(endX, endY);
    
    var linePaint = {"color": ui.getThemeColor("Accent1"), "stroke": true, "strokeWidth": 2};
    speedGraphCanvas.addPath(linePath.toObject(), linePaint);
    
    speedGraphCanvas.redraw();
}

// Mouse event handlers for interactive graph
// Try different event names based on documentation
graphCanvas.onMousePress = function(position, button) {
    var startX = graphPadding;
    var startY = graphHeight - graphPadding;
    var endX = graphWidth - graphPadding;
    var endY = graphPadding;
    
    // HANDLE BOUNDS & CLICK DETECTION SOLUTION
    // PROBLEM: When dragging handles outside graph bounds, visual handles and click targets desync
    // DISCOVERY: Drawing function already had clamping, but click detection used unclamped positions
    // SOLUTION: Use identical clamping for both visual display AND click detection
    
    // Calculate actual handle positions (can be outside bounds for extreme easing values)
    var actualCp1X = startX + currentEasing.x1 * (endX - startX);
    var actualCp1Y = endY + currentEasing.y1 * (startY - endY);
    var actualCp2X = startX + currentEasing.x2 * (endX - startX);
    var actualCp2Y = endY + currentEasing.y2 * (startY - endY);
    
    // Clamp handle positions for click detection (MUST match drawing function clamping)
    // This keeps handles clickable even when easing values go beyond 0-1 range
    var cp1X = Math.max(startX - 20, Math.min(endX + 20, actualCp1X));
    var cp1Y = Math.max(endY - 20, Math.min(startY + 20, actualCp1Y));
    var cp2X = Math.max(startX - 20, Math.min(endX + 20, actualCp2X));
    var cp2Y = Math.max(endY - 20, Math.min(startY + 20, actualCp2Y));
    
    var dist1 = Math.sqrt((position.x - cp1X) * (position.x - cp1X) + (position.y - cp1Y) * (position.y - cp1Y));
    var dist2 = Math.sqrt((position.x - cp2X) * (position.x - cp2X) + (position.y - cp2Y) * (position.y - cp2Y));
    
    if (dist1 < handleRadius * 2) {
        isDragging = true;
        dragHandle = 'cp1';
        // Store initial drag state for shift+drag axis constraint
        dragStartPosition = { x: position.x, y: position.y };
        dragStartEasing = {
            x1: currentEasing.x1,
            y1: currentEasing.y1,
            x2: currentEasing.x2,
            y2: currentEasing.y2
        };
        axisConstraint = null;
    } else if (dist2 < handleRadius * 2) {
        isDragging = true;
        dragHandle = 'cp2';
        // Store initial drag state for shift+drag axis constraint
        dragStartPosition = { x: position.x, y: position.y };
        dragStartEasing = {
            x1: currentEasing.x1,
            y1: currentEasing.y1,
            x2: currentEasing.x2,
            y2: currentEasing.y2
        };
        axisConstraint = null;
    }
};

// MOUSE MOVE HANDLER - Core of the interactive bezier editor
// CAVALRY API NOTE: The 'modifiers' parameter is always undefined in Cavalry
// Must use api.isShiftHeld() instead for reliable modifier key detection
graphCanvas.onMouseMove = function(position, modifiers) {
    if (!isDragging) return;
    
    // Graph coordinate system setup
    var startX = graphPadding;
    var startY = graphHeight - graphPadding;  // Bottom-left origin
    var endX = graphWidth - graphPadding;
    var endY = graphPadding;                  // Top-right corner
    
    var x = position.x;
    var y = position.y;
    
    // SHIFT KEY DETECTION - Use Cavalry's official API
    // DISCOVERY: Mouse event modifiers parameter is undefined in Cavalry
    // Solution: api.isShiftHeld() provides reliable shift key detection
    var shiftPressed = api.isShiftHeld();
    
    if (shiftPressed) {
        // AXIS CONSTRAINT CALCULATION
        // IMPORTANT: Recalculate every time shift is pressed during drag
        // This allows dynamic constraint changes by releasing/re-pressing shift
        // Uses CURRENT handle position (not drag start) for angle calculation
        if (dragStartPosition) {
            var currentX, currentY, originX, originY;
            
            if (dragHandle === 'cp1') {
                // First handle - origin is at (0,0) bottom-left
                // Use current easing values (not drag start) for recalculation
                currentX = currentEasing.x1;
                currentY = currentEasing.y1;
                originX = 0.0;
                originY = 0.0;
            } else if (dragHandle === 'cp2') {
                // Second handle - origin is at (1,1) top-right  
                // Use current easing values (not drag start) for recalculation
                currentX = currentEasing.x2;
                currentY = currentEasing.y2;
                originX = 1.0;
                originY = 1.0;
            }
            
            // Calculate angle from origin to handle
            var deltaX = currentX - originX;
            var deltaY = currentY - originY;
            var angle = Math.atan2(Math.abs(deltaY), Math.abs(deltaX));
            
            // Determine closest axis (45 degrees = π/4)
            if (angle < Math.PI / 4) {
                // Closer to horizontal - snap Y coordinate, lock Y movement (allow X movement)
                axisConstraint = 'x';
                var snapToY = (Math.abs(currentY - 0.0) < Math.abs(currentY - 1.0)) ? 0.0 : 1.0;
                if (dragHandle === 'cp1') {
                    currentEasing.y1 = snapToY;
                } else if (dragHandle === 'cp2') {
                    currentEasing.y2 = snapToY;
                }
            } else {
                // Closer to vertical - snap X coordinate, lock X movement (allow Y movement)
                axisConstraint = 'y';
                var snapToX = (Math.abs(currentX - 0.0) < Math.abs(currentX - 1.0)) ? 0.0 : 1.0;
                if (dragHandle === 'cp1') {
                    currentEasing.x1 = snapToX;
                } else if (dragHandle === 'cp2') {
                    currentEasing.x2 = snapToX;
                }
            }
        }
        
        // Apply axis constraint to mouse movement
        if (axisConstraint === 'x') {
            // Allow X-axis movement only (lock Y position)
            y = dragStartPosition.y;
        } else if (axisConstraint === 'y') {
            // Allow Y-axis movement only (lock X position)
            x = dragStartPosition.x;
        }
    } else {
        // Shift not pressed - reset axis constraint
        axisConstraint = null;
    }
    
    // Convert screen coordinates to easing values
    // Only update the coordinate that's not constrained by shift+drag
    if (dragHandle === 'cp1') {
        if (!shiftPressed || axisConstraint !== 'y') {
            currentEasing.x1 = (x - startX) / (endX - startX);
        }
        if (!shiftPressed || axisConstraint !== 'x') {
            currentEasing.y1 = (y - endY) / (startY - endY);
        }
    } else if (dragHandle === 'cp2') {
        if (!shiftPressed || axisConstraint !== 'y') {
            currentEasing.x2 = (x - startX) / (endX - startX);
        }
        if (!shiftPressed || axisConstraint !== 'x') {
            currentEasing.y2 = (y - endY) / (startY - endY);
        }
    }
    
    // Allow values outside 0-1 range for extreme easing curves
    
    updateTextInput();
    drawCurve();
};

graphCanvas.onMouseRelease = function(position, button) {
    if (isDragging) {
        isDragging = false;
        dragHandle = null;
        
        // Reset axis constraint variables
        dragStartPosition = null;
        dragStartEasing = null;
        axisConstraint = null;
        
        // Reset dropdown to show custom curve
        presetList.setText("Select a preset...");
        
        // Apply on drag if enabled
        if (applyOnDragEnabled) {
            applyEasingToKeyframes();
        }
    }
};

// Speed graph mouse event handlers
speedGraphCanvas.onMousePress = function(position, button) {
    var startX = speedGraphPadding;
    var startY = speedGraphHeight - speedGraphPadding;  // Bottom
    var endX = speedGraphWidth - speedGraphPadding;
    var endY = speedGraphPadding;  // Top
    var midX = startX + (endX - startX) / 2;
    
    // Calculate handle positions (both at bottom corners)
    var outHandleX = startX + (speedEasing.outInfluence / 100) * (midX - startX);
    var inHandleX = endX - (speedEasing.inInfluence / 100) * (endX - midX);
    
    var dist1 = Math.abs(position.x - outHandleX);
    var dist2 = Math.abs(position.x - inHandleX);
    
    // Check if click is near bottom corners and near handle X position
    if (dist1 < speedHandleRadius * 2 && Math.abs(position.y - endY) < speedHandleRadius * 2) {
        speedDragging = true;
        speedDragHandle = 'out';
    } else if (dist2 < speedHandleRadius * 2 && Math.abs(position.y - endY) < speedHandleRadius * 2) {
        speedDragging = true;
        speedDragHandle = 'in';
    }
};

speedGraphCanvas.onMouseMove = function(position, modifiers) {
    if (!speedDragging) return;
    
    var startX = speedGraphPadding;
    var endX = speedGraphWidth - speedGraphPadding;
    var midX = startX + (endX - startX) / 2; // Halfway point
    
    // Check if shift is held for mirroring behavior
    var shiftPressed = api.isShiftHeld();
    
    if (speedDragHandle === 'out') {
        // Clamp to left half of graph (0% to middle)
        var clampedX = Math.max(startX, Math.min(midX, position.x));
        // Convert position to influence (0-100%)
        speedEasing.outInfluence = ((clampedX - startX) / (midX - startX)) * 100;
        
        // Mirror to incoming handle if shift is held
        if (shiftPressed) {
            speedEasing.inInfluence = speedEasing.outInfluence;
        }
    } else if (speedDragHandle === 'in') {
        // Clamp to right half of graph (middle to 100%)
        var clampedX = Math.max(midX, Math.min(endX, position.x));
        // Convert position to influence (0-100%)
        speedEasing.inInfluence = ((endX - clampedX) / (endX - midX)) * 100;
        
        // Mirror to outgoing handle if shift is held
        if (shiftPressed) {
            speedEasing.outInfluence = speedEasing.inInfluence;
        }
    }
    
    syncSpeedToValue();
    updateTextInput();
    drawSpeedCurve();  // Redraw velocity curve
    
    if (applyOnDragEnabled) {
        applyEasingToKeyframes();
    }
};

speedGraphCanvas.onMouseRelease = function(position, button) {
    if (speedDragging) {
        speedDragging = false;
        speedDragHandle = null;
        
        // Reset dropdown to show custom curve
        presetList.setText("Select a preset...");
    }
};

// Update the text input with current easing values
function updateTextInput() {
    // Ensure all easing values are defined with defaults
    var x1 = (currentEasing.x1 !== undefined) ? currentEasing.x1 : 0.25;
    var y1 = (currentEasing.y1 !== undefined) ? currentEasing.y1 : 0.1;
    var x2 = (currentEasing.x2 !== undefined) ? currentEasing.x2 : 0.25;
    var y2 = (currentEasing.y2 !== undefined) ? currentEasing.y2 : 1.0;
    
    var text = x1.toFixed(3) + ", " + 
               y1.toFixed(3) + ", " + 
               x2.toFixed(3) + ", " + 
               y2.toFixed(3);
    
    // Set flag to prevent callback loop
    isUpdatingTextInput = true;
    bezierInput.setText(text);
    isUpdatingTextInput = false;
}

// Parse text input and update curve
function updateFromTextInput() {
    try {
        var text = bezierInput.getText();
        var values = text.split(',').map(function(v) { return parseFloat(v.trim()); });
        
        if (values.length === 4 && values.every(function(v) { return !isNaN(v); })) {
            currentEasing.x1 = values[0]; // Allow values outside 0-1 range
            currentEasing.y1 = values[1];
            currentEasing.x2 = values[2];
            currentEasing.y2 = values[3];
            
            drawCurve();
            syncValueToSpeed(); // Sync speed graph too
        } else {
            console.log("Error: Invalid cubic bezier values");
        }
    } catch (e) {
        console.log("Error: Failed to parse cubic bezier values");
    }
}

// Get easing from selected keyframes
function getEasingFromKeyframes() {
    try {
        var selectedKeyframes = api.getSelectedKeyframes();
        var keyframeIds = api.getSelectedKeyframeIds();
        
        if (keyframeIds.length !== 2) {
            console.log("Error: Please select exactly 2 keyframes");
            return false;
        }
        
        // Get the attribute path from the first keyframe
        var attrPath = api.getAttributeFromKeyframeId(keyframeIds[0]);
        var attrPath2 = api.getAttributeFromKeyframeId(keyframeIds[1]);
        
        if (attrPath !== attrPath2) {
            console.log("Error: Both keyframes must be on the same attribute");
            return false;
        }
        
        // Find the attribute path that has exactly 2 frames
        var fullAttributePath = null;
        var selectedFrames = null;
        
        for (let [key, frames] of Object.entries(selectedKeyframes)) {
            if (frames.length === 2) {
                fullAttributePath = key;
                selectedFrames = frames.sort((a, b) => a - b);
                break;
            }
        }
        
        if (!fullAttributePath) {
            console.log("Error: Could not find attribute with 2 selected keyframes");
            return false;
        }
        
        // Parse the full attribute path
        var hashIndex = fullAttributePath.indexOf('#');
        if (hashIndex === -1) {
            console.log("Error: Invalid layer ID format");
            return false;
        }
        
        var dotAfterHash = fullAttributePath.indexOf('.', hashIndex);
        if (dotAfterHash === -1) {
            console.log("Error: Could not parse attribute");
            return false;
        }
        
        var layerId = fullAttributePath.substring(0, dotAfterHash);
        var attrId = fullAttributePath.substring(dotAfterHash + 1);
        
        var firstFrame = selectedFrames[0];
        var secondFrame = selectedFrames[1];
        var frameDiff = secondFrame - firstFrame;
        
        // Get keyframe values
        var currentFrame = api.getFrame();
        api.setFrame(firstFrame);
        var firstValue = api.get(layerId, attrId);
        api.setFrame(secondFrame);
        var secondValue = api.get(layerId, attrId);
        api.setFrame(currentFrame);
        
        var valueDiff = secondValue - firstValue;
        
        // Get bezier data from keyframes
        var firstKeyData = api.get(keyframeIds[0], 'data');
        var secondKeyData = api.get(keyframeIds[1], 'data');
        
        // Match keyframes to frame numbers
        var frameZeroData, frameEndData;
        if (Math.abs(firstKeyData.numValue - firstValue) < 0.1) {
            frameZeroData = firstKeyData;
            frameEndData = secondKeyData;
        } else {
            frameZeroData = secondKeyData;
            frameEndData = firstKeyData;
        }
        
        // Extract bezier handles
        var outHandleX = null, outHandleY = null;
        var inHandleX = null, inHandleY = null;
        
        if (frameZeroData && frameZeroData.rightBez) {
            outHandleX = frameZeroData.rightBez.x;
            outHandleY = frameZeroData.rightBez.y;
        }
        
        if (frameEndData && frameEndData.leftBez) {
            inHandleX = frameEndData.leftBez.x;
            inHandleY = frameEndData.leftBez.y;
        }
        
        if (outHandleX !== null && inHandleX !== null && frameDiff > 0) {
            // Keyframes have bezier interpolation
            var bezier = cavalryToCubicBezier(outHandleX, outHandleY, inHandleX, inHandleY, frameDiff, valueDiff);
            currentEasing = bezier;
            updateTextInput();
            drawCurve();
            syncValueToSpeed(); // Sync speed graph too
            return true;
        } else if (frameDiff > 0) {
            // Check if keyframes are linear interpolation
            var firstKeyData = api.get(keyframeIds[0], 'data');
            var secondKeyData = api.get(keyframeIds[1], 'data');
            
            
            // Keyframes are linear - set to linear easing (0, 0, 1, 1)
            currentEasing = { x1: 0, y1: 0, x2: 1, y2: 1 };
            updateTextInput();
            drawCurve();
            syncValueToSpeed(); // Sync speed graph too
            return true;
        } else {
            console.log("Error: Could not extract easing data from keyframes");
            return false;
        }
        
    } catch (error) {
        console.log("Error: " + error.message);
        return false;
    }
}

// Ensure keyframes are set to bezier interpolation and unlock tangents
function ensureBezierInterpolation(keyframeId, attrId, layerId, frame) {
    try {
        // Get current keyframe data
        var keyData = api.get(keyframeId, 'data');
        if (!keyData) {
            console.log("Could not get keyframe data for:", keyframeId);
            return false;
        }
        
        // Set interpolation to bezier (0 = bezier, 1 = linear, 2 = step)
        if (keyData.interpolation !== 0) {
            try {
                api.modifyKeyframe(keyframeId, 'interpolation', 0);
            } catch (e) {
                console.log("Could not set interpolation to bezier:", e.message);
            }
        }
        
        // Unlock tangents using api.set() as recommended by Cavalry Discord
        try {
            // Use api.set() to unlock both locked and weightLocked properties
            api.set(keyframeId, 'locked', false);
            api.set(keyframeId, 'weightLocked', false);
            
        } catch (e) {
            console.log("Failed to unlock keyframe tangents with api.set():", e.message);
        }
        
        return true;
    } catch (error) {
        console.log("Error ensuring bezier interpolation:", error.message);
        return false;
    }
}

// Apply easing to a single pair of keyframes
function applyEasingToKeyframePair(currentKeyId, nextKeyId, currentKeyData, nextKeyData, cavalryHandles, attrId, layerId, currentFrame, currentValue, nextFrame, nextValue) {
    try {
        // Keyframes should already be unlocked and converted to bezier from the main function
        
        // Refresh keyframe data to ensure we have the latest state after conversion
        currentKeyData = api.get(currentKeyId, 'data');
        nextKeyData = api.get(nextKeyId, 'data');
        
        // Use modifyKeyframeTangent to set bezier handles using the working pattern
        try {
            // Define unlock properties like in the working example
            var unlocked = { angleLocked: false, weightLocked: false };
            
            // Set right handle for current keyframe (outHandle) - controls curve TO next keyframe
            // Now we should have rightBez after conversion, but check anyway
            if (currentKeyData) {
                var tangentObj1 = {};
                tangentObj1[attrId] = {
                    frame: currentFrame,
                    inHandle: false,
                    outHandle: true,
                    xValue: currentFrame + cavalryHandles.outHandleX,  // Use xValue for correct position
                    yValue: currentValue + cavalryHandles.outHandleY, // Use yValue for correct position
                    ...unlocked  // But keep the unlock properties
                };
                api.modifyKeyframeTangent(layerId, tangentObj1);
            } else {
                console.log("Error: Could not get current keyframe data for", currentKeyId);
            }
            
            // Set left handle for next keyframe (inHandle) - controls curve FROM current keyframe
            // Now we should have leftBez after conversion, but check anyway
            if (nextKeyData) {
                var tangentObj2 = {};
                tangentObj2[attrId] = {
                    frame: nextFrame,
                    inHandle: true,
                    outHandle: false,
                    xValue: nextFrame + cavalryHandles.inHandleX,  // Use xValue for correct position
                    yValue: nextValue + cavalryHandles.inHandleY, // Use yValue for correct position
                    ...unlocked  // But keep the unlock properties
                };
                api.modifyKeyframeTangent(layerId, tangentObj2);
            } else {
                console.log("Error: Could not get next keyframe data for", nextKeyId);
            }
            
            // Keyframes are now unlocked and set to bezier interpolation
            // console.log("Keyframes set to bezier interpolation with unlocked tangents");
            
            
        } catch (e) {
            // Alternative approach: try direct property setting
            try {
                // Set right handle for current keyframe (outHandle) - controls curve TO next keyframe
                if (currentKeyData && currentKeyData.rightBez) {
                    api.modifyKeyframe(currentKeyId, 'rightBez.x', cavalryHandles.outHandleX);
                    api.modifyKeyframe(currentKeyId, 'rightBez.y', cavalryHandles.outHandleY);
                }
                
                // Set left handle for next keyframe (inHandle) - controls curve FROM current keyframe
                if (nextKeyData && nextKeyData.leftBez) {
                    api.modifyKeyframe(nextKeyId, 'leftBez.x', cavalryHandles.inHandleX);
                    api.modifyKeyframe(nextKeyId, 'leftBez.y', cavalryHandles.inHandleY);
                }
                
            } catch (e2) {
                console.log("Error: Alternative approach also failed:", e2.message);
            }
        }
        
        return true;
        
    } catch (error) {
        console.log("Error applying easing to keyframe pair:", error.message);
        console.log("Error details:", error);
        return false;
    }
}

function unlockAllKeyframes(keyframeIds, attrId, layerId, selectedFrames) {
    
    // Define unlock properties like in the working example
    var unlocked = { angleLocked: false, weightLocked: false };
    
    for (var i = 0; i < keyframeIds.length; i++) {
        var keyframeId = keyframeIds[i];
        var frame = selectedFrames[i];
        
        try {
            // Check current interpolation type
            var keyData = api.get(keyframeId, 'data');
            
            // CRITICAL: Set to bezier interpolation FIRST if not already
            // 0 = bezier, 1 = linear, 2 = step
            if (keyData && keyData.interpolation !== 0) {
                api.modifyKeyframe(keyframeId, 'interpolation', 0);
                
                // After changing interpolation, we need to refresh the keyframe data
                // because the bezier handles may have been created
                keyData = api.get(keyframeId, 'data');
            }
            
            // Ensure bezier handles exist by setting default values if they don't
            if (keyData) {
                // Check if bezier handles exist, if not create them with default values
                if (!keyData.leftBez) {
                    try {
                        api.modifyKeyframe(keyframeId, 'leftBez.x', 0);
                        api.modifyKeyframe(keyframeId, 'leftBez.y', 0);
                    } catch (e) {
                        console.log("Error: Could not create leftBez handle:", e.message);
                    }
                }
                
                if (!keyData.rightBez) {
                    try {
                        api.modifyKeyframe(keyframeId, 'rightBez.x', 0);
                        api.modifyKeyframe(keyframeId, 'rightBez.y', 0);
                    } catch (e) {
                        console.log("Error: Could not create rightBez handle:", e.message);
                    }
                }
            }
            
            // Unlock using modifyKeyframeTangent with the working pattern
            try {
                var unlockObj = {};
                unlockObj[attrId] = {
                    frame: frame,
                    inHandle: true,
                    outHandle: true,
                    ...unlocked  // Spread the unlock properties
                };
                
                api.modifyKeyframeTangent(layerId, unlockObj);
            } catch (e) {
                console.log("Error: modifyKeyframeTangent failed for keyframe", i, ":", e.message);
            }
            
            // Also try api.set() as backup for unlocking
            // try {
            //     api.set(keyframeId, 'locked', false);
            //     api.set(keyframeId, 'weightLocked', false);
            // } catch (e2) {
            //     console.log("Error: api.set() backup failed for keyframe", i, ":", e2.message);
            // }
            
            
        } catch (e) {
            // Silently continue - keyframe processing errors are common and usually not critical
            // console.log("Error: Failed to process keyframe", i, ":", e);
        }
    }
}

// MULTI-ATTRIBUTE KEYFRAME PROCESSING
// MAJOR DISCOVERY: Can apply easing to keyframes across multiple layers and properties simultaneously
// This was a significant breakthrough that makes the tool much more powerful for batch operations
function applyEasingToKeyframes() {
    try {
        // CAVALRY API INSIGHT: These two functions return different but complementary data
        var selectedKeyframes = api.getSelectedKeyframes();  // Object with attribute paths as keys, frame arrays as values
        var keyframeIds = api.getSelectedKeyframeIds();      // Array of keyframe ID strings
        
        if (keyframeIds.length < 2) {
            console.log("Error: Please select at least 2 keyframes");
            return false;
        }
        
        // GROUPING STRATEGY: Group keyframes by their full attribute paths
        // This allows processing different attributes (layers/properties) independently
        var attributeGroups = {};
        
        // CAVALRY API STRUCTURE: selectedKeyframes object is already grouped by full attribute path
        // Keys are like "basicShape#1.position.x", values are arrays of frame numbers
        // We need to match these to the keyframe IDs for processing
        for (let [fullAttributePath, frames] of Object.entries(selectedKeyframes)) {
            if (frames.length >= 2) {
                // Parse the full attribute path to get layer and attribute IDs
                var hashIndex = fullAttributePath.indexOf('#');
                if (hashIndex === -1) continue;
                
                var dotAfterHash = fullAttributePath.indexOf('.', hashIndex);
                if (dotAfterHash === -1) continue;
                
                var layerId = fullAttributePath.substring(0, dotAfterHash);
                var attrId = fullAttributePath.substring(dotAfterHash + 1);
                
                // Get keyframe IDs that belong to this specific attribute path
                var attributeKeyframeIds = [];
                
                for (var i = 0; i < keyframeIds.length; i++) {
                    var keyframeAttrPath = api.getAttributeFromKeyframeId(keyframeIds[i]);
                    
                    // Compare the full attribute paths directly
                    if (keyframeAttrPath === fullAttributePath) {
                        attributeKeyframeIds.push(keyframeIds[i]);
                    }
                }
                
                if (attributeKeyframeIds.length >= 2) {
                    attributeGroups[fullAttributePath] = {
                        layerId: layerId,
                        attrId: attrId,
                        frames: frames.sort((a, b) => a - b),
                        keyframeIds: attributeKeyframeIds
                    };
                }
            }
        }
        
        if (Object.keys(attributeGroups).length === 0) {
            console.log("Error: No valid attribute groups found with 2+ keyframes");
            return false;
        }
        
        var totalProcessed = 0;
        var currentFrameTime = api.getFrame();
        
        // Process each attribute group
        for (let [attributePath, group] of Object.entries(attributeGroups)) {
            try {
                // STEP 1: Convert Linear keyframes to Bezier and unlock ALL keyframes for this attribute
                unlockAllKeyframes(group.keyframeIds, group.attrId, group.layerId, group.frames);
                
                // Apply easing to each consecutive pair of keyframes in this attribute
                for (var i = 0; i < group.keyframeIds.length - 1; i++) {
                    var currentKeyId = group.keyframeIds[i];
                    var nextKeyId = group.keyframeIds[i + 1];
                    
                    var currentFrame = group.frames[i];
                    var nextFrame = group.frames[i + 1];
                    var frameDiff = nextFrame - currentFrame;
                    
                    // Get keyframe values
                    api.setFrame(currentFrame);
                    var currentValue = api.get(group.layerId, group.attrId);
                    api.setFrame(nextFrame);
                    var nextValue = api.get(group.layerId, group.attrId);
                    
                    var valueDiff = nextValue - currentValue;
                    
                    // Convert cubic bezier to Cavalry format
                    var cavalryHandles = cubicBezierToCavalry(
                        currentEasing.x1, currentEasing.y1, 
                        currentEasing.x2, currentEasing.y2, 
                        frameDiff, valueDiff
                    );
                    
                    // Get keyframe data to modify
                    var currentKeyData = api.get(currentKeyId, 'data');
                    var nextKeyData = api.get(nextKeyId, 'data');
                    
                    // Apply easing to this pair
                    applyEasingToKeyframePair(currentKeyId, nextKeyId, currentKeyData, nextKeyData, cavalryHandles, group.attrId, group.layerId, currentFrame, currentValue, nextFrame, nextValue);
                    
                    totalProcessed++;
                }
                
            } catch (groupError) {
                console.log("Error processing attribute " + attributePath + ":", groupError.message);
            }
        }
        
        // Restore original frame position
        api.setFrame(currentFrameTime);
        return true;
        
    } catch (error) {
        console.log("Error applying easing to keyframes:", error.message);
        console.log("Error details:", error);
        return false;
    }
}

// Mouse event handlers will be added when interactive graph is implemented

// Context menu functions


function showPresetContextMenu() {
    // Clear any existing menu items first
    ui.clearContextMenu();

    var separatorItem = {
    name: "",
    };
    
    // Add menu items using proper Cavalry API
    ui.addMenuItem({
        name: "Save Preset...",
        onMouseRelease: function() {
            savePreset();
        }
    });
    
    ui.addMenuItem(separatorItem);
    
    ui.addMenuItem({
        name: "Rename Preset",
        onMouseRelease: function() {
            renamePreset();
        }
    });
    
    ui.addMenuItem({
        name: "Delete Preset",
        onMouseRelease: function() {
            deletePreset();
        }
    });
    
    ui.addMenuItem(separatorItem);

    
    ui.addMenuItem({
        name: "Import Presets",
        onMouseRelease: function() {
            importPresets();
        }
    });
    
    ui.addMenuItem({
        name: "Copy All Presets",
        onMouseRelease: function() {
            exportPresets();
        }
    });
    
    ui.addMenuItem({
        name: "Delete All Presets",
        onMouseRelease: function() {
            deleteAllPresets();
        }
    });

    ui.addMenuItem(separatorItem);
    

    ui.addMenuItem({
        name: "Copy Current Curve to Clipboard",
        onMouseRelease: function() {
            copyCubicBezierToClipboard();
        }
    });
    
    ui.addMenuItem({
        name: "Copy Keyframe Duration in ms",
        onMouseRelease: function() {
            copyKeyframeDuration();
        }
    });
    
    ui.addMenuItem({
        name: "Copy Keyframe Values",
        onMouseRelease: function() {
            copyKeyframeValues();
        }
    });
    
    ui.addMenuItem({
        name: "Copy All Keyframe Info",
        onMouseRelease: function() {
            copyAllKeyframeInfo();
        }
    });

    ui.addMenuItem(separatorItem);
    
    ui.addMenuItem({
        name: "Apply when dragging handles" + (applyOnDragEnabled ? " ✓" : ""),
        onMouseRelease: function() {
            toggleApplyOnDrag();
        }
    });

    ui.addMenuItem(separatorItem);

    ui.addMenuItem({
        name: "Easey Version " + currentVersion,
        enabled: false
    });
    ui.addMenuItem({
        name: "By Canva Creative Team",
        enabled: false
    });
    ui.addMenuItem({
        name: "Get updates and more plugins...",
        enabled: true,
        onMouseRelease: function() {
            api.openURL("https://canvacreative.team/motion");
        }
    });


    
    
    // Show the context menu
    ui.showContextMenu();
}

function savePreset() {
    try {
        var modal = new ui.Modal();
        var presetName = modal.showStringInput("Save Preset", "Enter preset name (max 30 chars):", "My Preset");
        
        if (presetName && presetName.trim() !== "") {
            if (presetName.length > 30) {
                console.log("Preset name too long. Please use 30 characters or less.");
                return;
            }
            
            presets[presetName] = {
                x1: currentEasing.x1,
                y1: currentEasing.y1,
                x2: currentEasing.x2,
                y2: currentEasing.y2
            };
            
            populatePresetDropdown();
            savePresets();
        }
    } catch (e) {
        console.log("Error saving preset:", e.message);
    }
}

function copyCubicBezierToClipboard() {
    var text = "cubic-bezier(" + currentEasing.x1.toFixed(3) + ", " + 
               currentEasing.y1.toFixed(3) + ", " + 
               currentEasing.x2.toFixed(3) + ", " + 
               currentEasing.y2.toFixed(3) + ")";
    api.setClipboardText(text);
    console.log("Copied " + text + " to clipboard");
}

// KEYFRAME ANALYSIS INTEGRATION
// These functions were integrated from the "Keyframe Easing Duration Copier" script
// DISCOVERY: Can extract detailed keyframe information including easing, duration, and values
// INTEGRATION: Added to context menu for seamless workflow between curve editing and keyframe analysis

// Helper function to get composition frame rate
function getCompositionFrameRate() {
    try {
        var activeCompId = api.getActiveComp();
        
        // Get the frame rate directly using the API
        var frameRate = api.get(activeCompId, "fps");
        
        // Validate the frame rate
        if (frameRate === undefined || frameRate === null) {
            throw new Error("Frame rate is undefined or null");
        }
        
        if (typeof frameRate !== 'number' || frameRate <= 0) {
            throw new Error("Invalid frame rate value: " + frameRate);
        }
        
        return frameRate;
        
    } catch (e) {
        console.error("Error getting frame rate:", e.message);
        throw new Error("Failed to get composition frame rate: " + e.message);
    }
}

// Helper function to convert frames to milliseconds
function framesToMilliseconds(frames, frameRate) {
    return Math.round((frames / frameRate) * 1000);
}

// Helper function to get keyframe data and extract bezier information
function getKeyframeInfo() {
    var selectedKeyframes = api.getSelectedKeyframes();
    var keyframeIds = api.getSelectedKeyframeIds();
    
    // Check if exactly 2 keyframes are selected
    if (keyframeIds.length !== 2) {
        console.error("Error: Please select exactly 2 keyframes");
        return null;
    }
    
    try {
        // Get the attribute path from the first keyframe
        var attrPath = api.getAttributeFromKeyframeId(keyframeIds[0]);
        var attrPath2 = api.getAttributeFromKeyframeId(keyframeIds[1]);
        
        // Verify both keyframes are on the same attribute
        if (attrPath !== attrPath2) {
            console.error("Error: Both keyframes must be on the same attribute");
            return null;
        }
        
        
        // Use the selectedKeyframes object to get the full path and frames
        var layerId, attrId, selectedFrames;
        var fullAttributePath = null;
        
        // Find the attribute path that has exactly 2 frames
        for (let [key, frames] of Object.entries(selectedKeyframes)) {
            if (frames.length === 2) {
                fullAttributePath = key;
                selectedFrames = frames.sort((a, b) => a - b);
                break;
            }
        }
        
        if (!fullAttributePath) {
            console.error("Error: Could not find attribute with 2 selected keyframes");
            return null;
        }
        
        
        // Parse the full attribute path to extract layerId and attrId
        // Expected format: "layerId.attributePath"
        // For position.x, we want: layerId="basicShape#1", attrId="position.x"
        
        // Find the first dot after a # symbol (to handle layer IDs like "basicShape#1")
        var hashIndex = fullAttributePath.indexOf('#');
        if (hashIndex === -1) {
            console.error("Error: Invalid layer ID format in: " + fullAttributePath);
            return null;
        }
        
        // Find the first dot after the hash
        var dotAfterHash = fullAttributePath.indexOf('.', hashIndex);
        if (dotAfterHash === -1) {
            console.error("Error: Could not parse attribute from: " + fullAttributePath);
            return null;
        }
        
        layerId = fullAttributePath.substring(0, dotAfterHash);
        attrId = fullAttributePath.substring(dotAfterHash + 1);
        
        
        if (selectedFrames.length !== 2) {
            console.error("Error: Could not find 2 selected frames");
            return null;
        }
        
        var firstFrame = selectedFrames[0];
        var secondFrame = selectedFrames[1];
        
        
        // Store current frame position to restore later
        var currentFrame = api.getFrame();
        
        // Get keyframe values by evaluating the attribute at those frames
        var firstValue, secondValue;
        try {
            // Move to the first keyframe and get its value
            api.setFrame(firstFrame);
            firstValue = api.get(layerId, attrId);
            
            // Move to the second keyframe and get its value
            api.setFrame(secondFrame);
            secondValue = api.get(layerId, attrId);
            
            // Restore original frame position
            api.setFrame(currentFrame);
        } catch (e) {
            // Restore frame position even if there's an error
            api.setFrame(currentFrame);
            console.error("Error getting keyframe values: " + e.message);
            return null;
        }
        
        
        // Get actual bezier data from the keyframes
        var easingValues = null;
        
        try {
            // Get keyframe data
            var firstKeyData = api.get(keyframeIds[0], 'data');
            var secondKeyData = api.get(keyframeIds[1], 'data');
            
            
            // Extract bezier handle information
            // I need to match keyframe IDs to frame numbers correctly
            var kf1Data = api.get(keyframeIds[0], 'data');
            var kf2Data = api.get(keyframeIds[1], 'data');
            
            
            // Match keyframes to frame numbers by comparing values
            var frameZeroData, frameEndData;
            
            // Frame 0 has value firstValue, frame 47 has value secondValue
            if (Math.abs(kf1Data.numValue - firstValue) < 0.1) {
                frameZeroData = kf1Data;
                frameEndData = kf2Data;
            } else {
                frameZeroData = kf2Data;
                frameEndData = kf1Data;
            }
            
            
            // Extract the correct handles:
            // - rightBez from frame 0 (outgoing handle)
            // - leftBez from frame 47 (incoming handle)
            var outHandleX = null, outHandleY = null;
            var inHandleX = null, inHandleY = null;
            
            if (frameZeroData && frameZeroData.rightBez) {
                outHandleX = frameZeroData.rightBez.x;
                outHandleY = frameZeroData.rightBez.y;
            }
            
            if (frameEndData && frameEndData.leftBez) {
                inHandleX = frameEndData.leftBez.x;
                inHandleY = frameEndData.leftBez.y;
            }
            
            
            // Convert to cubic-bezier format
            if (outHandleX !== null && inHandleX !== null) {
                var frameDiff = secondFrame - firstFrame;
                var valueDiff = secondValue - firstValue;
                
                if (frameDiff > 0) {
                    
                    // For cubic-bezier:
                    // x1 = outgoing handle X relative to frame difference
                    var x1 = outHandleX / frameDiff;
                    
                    // y1 = outgoing handle Y relative to value difference  
                    var y1 = 0;
                    if (Math.abs(valueDiff) > 0.001) {
                        y1 = outHandleY / valueDiff;
                    }
                    
                    // x2 = incoming handle X (negative, relative to end frame)
                    var x2 = (frameDiff + inHandleX) / frameDiff;
                    
                    // y2 = incoming handle Y relative to end value
                    var y2 = 1;
                    if (Math.abs(valueDiff) > 0.001) {
                        y2 = 1 + (inHandleY / valueDiff);
                    }
                    
                    
                    // Clamp values to reasonable ranges
                    x1 = Math.max(0, Math.min(1, x1));
                    x2 = Math.max(0, Math.min(1, x2));
                    
                    easingValues = x1.toFixed(3) + "," + y1.toFixed(3) + "," + x2.toFixed(3) + "," + y2.toFixed(3);
                }
            }
            
            if (!easingValues) {
                console.error("Could not extract bezier data from keyframes");
                return null;
            }
            
        } catch (e) {
            console.error("Error extracting bezier data:", e.message);
            return null;
        }
        
        // Get the composition frame rate - this will throw an error if it fails
        var frameRate = getCompositionFrameRate();
        var frameDuration = secondFrame - firstFrame;
        var durationMs = framesToMilliseconds(frameDuration, frameRate);
        
        // Get property name (clean up the attribute path)
        var propertyName = attrId;
        
        // Capitalize first letter and make it readable
        propertyName = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);
        propertyName = propertyName.replace(/([A-Z])/g, ' $1').trim();
        
        // Format values for display
        function formatValue(value) {
            if (typeof value === 'number') {
                // Round to 2 decimal places and remove trailing zeros
                return Math.round(value * 100) / 100;
            }
            return value;
        }
        
        var formattedStartValue = formatValue(firstValue);
        var formattedEndValue = formatValue(secondValue);
        
        return {
            easing: easingValues,
            duration: durationMs,
            frameDuration: frameDuration,
            propertyName: propertyName,
            startValue: formattedStartValue,
            endValue: formattedEndValue,
            layerId: layerId,
            attrId: attrId,
            firstFrame: firstFrame,
            secondFrame: secondFrame,
            frameRate: frameRate
        };
        
    } catch (error) {
        console.error("Overall error:", error.message);
        return null;
    }
}

// Functions for copying keyframe information
function copyKeyframeDuration() {
    try {
        var info = getKeyframeInfo();
        if (info) {
            var durationText = info.propertyName + ": " + info.duration + "ms (" + info.frameDuration + " frames @ " + getCompositionFrameRate() + "fps)";
            api.setClipboardText(durationText);
            console.log("Copied duration: " + durationText);
        }
    } catch (e) {
        console.error("Duration copy error:", e.message);
    }
}

function copyKeyframeValues() {
    try {
        var info = getKeyframeInfo();
        if (info) {
            var valuesText = info.propertyName + " " + info.startValue + " > " + info.endValue;
            api.setClipboardText(valuesText);
            console.log("Copied values: " + valuesText);
        }
    } catch (e) {
        console.error("Values copy error:", e.message);
    }
}

function copyAllKeyframeInfo() {
    try {
        var info = getKeyframeInfo();
        if (info) {
            var allText = info.propertyName + " " + info.startValue + " > " + info.endValue + "\n" + "Easing: cubic-bezier(" + info.easing + ")" + "\n" +
                         "Duration: " + info.duration + "ms @ " + getCompositionFrameRate() + "fps" + "\n";
            api.setClipboardText(allText);
            console.log("Copied all keyframe info to clipboard");
        }
    } catch (e) {
        console.error("All info copy error:", e.message);
    }
}

function toggleApplyOnDrag() {
    applyOnDragEnabled = !applyOnDragEnabled;
    saveApplyOnDragSetting(); // Save the setting
}

function renamePreset() {
    var selectedPreset = presetList.getText();
    if (!selectedPreset || selectedPreset === "Select a preset..." || selectedPreset === "---" || selectedPreset === "Copy presets to clipboard" || selectedPreset === "Import presets from clipboard") {
        console.log("Please select a preset to rename");
        return;
    }
    
    try {
        var modal = new ui.Modal();
        var newName = modal.showStringInput("Rename Preset", "Enter new name (max 30 chars):", selectedPreset);
        
        if (newName && newName.trim() !== "" && newName !== selectedPreset) {
            if (newName.length > 30) {
                console.log("Preset name too long. Please use 30 characters or less.");
                return;
            }
            
            // Check if new name already exists
            if (presets[newName]) {
                console.log("A preset with that name already exists");
                return;
            }
            
            // Rename the preset
            presets[newName] = presets[selectedPreset];
            delete presets[selectedPreset];
            
            populatePresetDropdown();
            savePresets();
            
            // Select the renamed preset in the dropdown
            presetList.setText(newName);
            
        }
    } catch (e) {
        console.log("Error renaming preset:", e.message);
    }
}

function deletePreset() {
    var selectedPreset = presetList.getText();
    if (!selectedPreset || selectedPreset === "Select a preset..." || selectedPreset === "---" || selectedPreset === "Copy presets to clipboard" || selectedPreset === "Import presets from clipboard") {
        console.log("Please select a preset to delete");
        return;
    }
    
    try {
        // Simple confirmation using console - direct deletion
        delete presets[selectedPreset];
        populatePresetDropdown();
        savePresets();
    } catch (e) {
        console.log("Error deleting preset:", e.message);
    }
}

function deleteAllPresets() {
    try {
        // Count total presets
        var allPresetNames = Object.keys(presets);
        
        if (allPresetNames.length === 0) {
            console.log("No presets to delete");
            return;
        }
        
        var modal = new ui.Modal();
        var confirmText = "Are you sure you want to delete ALL " + allPresetNames.length + " presets?\n\nThis action cannot be undone.";
        var result = modal.showConfirmation("Delete All Presets", confirmText);
        
        if (result) {
            // Delete all presets (including built-in ones)
            for (var presetName in presets) {
                delete presets[presetName];
            }
            
            populatePresetDropdown();
            savePresets();
            console.log("Deleted all " + allPresetNames.length + " presets");
        }
        
    } catch (e) {
        console.log("Error deleting all presets:", e.message);
    }
}

// Button event handlers
applyButton.onClick = function() {
    applyEasingToKeyframes();
    
    // If on Speed tab, mark as modified so y values stay normalized
    var currentTab = tabView.currentTab();
    if (currentTab === 0) { // Speed tab
        speedGraphModified = true;
    }
};

getButton.onClick = function() {
    getEasingFromKeyframes();
};

mainContextButton.onClick = function() {
    showMainContextMenu();
};

presetContextButton.onClick = function() {
    showPresetContextMenu();
};

// Legacy button handlers removed - now handled by context menus

// Text input event handler
bezierInput.onValueChanged = function() {
    // Ignore programmatic updates to prevent callback loop
    if (isUpdatingTextInput) {
        return;
    }
    
    updateFromTextInput();
    
    // Only reset dropdown if this is user input (not from preset selection)
    if (!isUpdatingFromPreset) {
        presetList.setText("Select a preset...");
    }
};

// Preset list event handler
presetList.onValueChanged = function() {
    var selectedPreset = presetList.getText();
    
    // Handle "Select a preset..." option (do nothing)
    if (selectedPreset === "Select a preset...") {
        return;
    }
    
    // Handle regular presets
    if (selectedPreset && presets[selectedPreset]) {
        isUpdatingFromPreset = true; // Set flag to prevent dropdown reset
        currentEasing = Object.assign({}, presets[selectedPreset]);
        
        // If Speed tab is active, normalize y values for speed mode
        var currentTab = tabView.currentTab();
        if (currentTab === 0) { // Speed tab
            currentEasing.y1 = 0;
            currentEasing.y2 = 1;
        }
        
        updateTextInput();
        drawCurve();
        syncValueToSpeed(); // Update speed graph handles
        drawSpeedCurve(); // Update speed graph curve
        isUpdatingFromPreset = false; // Clear flag
    }
};

// Old rename/delete button handlers removed - now handled by context menus

// Export presets function
function exportPresets() {
    try {
        var presetsJson = JSON.stringify(presets, null, 2);
        api.setClipboardText(presetsJson);
    } catch (e) {
        console.log("Error exporting presets:", e.message);
    }
}

// Import presets function
function importPresets() {
    try {
        // Get clipboard content
        var clipboardContent = api.getClipboardText();
        if (!clipboardContent) {
            console.log("No content in clipboard");
            return;
        }
        
        // Try to parse as JSON
        var importedPresets;
        try {
            importedPresets = JSON.parse(clipboardContent);
        } catch (e) {
            console.log("Clipboard content is not valid JSON");
            return;
        }
        
        // Validate that it looks like a presets object
        if (typeof importedPresets !== 'object' || importedPresets === null) {
            console.log("Clipboard content is not a valid presets object");
            return;
        }
        
        // Check if there are existing presets
        var hasExistingPresets = Object.keys(presets).length > 0;
        
        if (hasExistingPresets) {
            // Automatically merge presets (clipboard presets will overwrite existing ones with same names)
            var originalCount = Object.keys(presets).length;
            for (var name in importedPresets) {
                presets[name] = importedPresets[name];
            }
            var newCount = Object.keys(presets).length;
            var addedCount = newCount - originalCount;
            
            savePresets();
            populatePresetDropdown();
        } else {
            // No existing presets, just import
            presets = importedPresets;
            savePresets();
            populatePresetDropdown();
        }
        
    } catch (e) {
        console.log("Error importing presets:", e.message);
    }
}

// Save presets and settings to preferences
function savePresets() {
    try {
        api.setPreferenceObject("easey_presets", presets);
    } catch (e) {
        console.log("Could not save presets to preferences:", e.message);
    }
}

// Save apply on drag setting to preferences
function saveApplyOnDragSetting() {
    try {
        api.setPreferenceObject("easey_applyOnDrag", applyOnDragEnabled);
    } catch (e) {
        console.log("Could not save apply on drag setting:", e.message);
    }
}

// PRESET PERSISTENCE MANAGEMENT
// CRITICAL DISCOVERY: Default presets must be handled carefully to respect user deletions
// PROBLEM: If you merge saved presets with defaults, deleted presets come back on reload
// SOLUTION: Replace entire presets object with saved data, don't merge
function loadSavedPresets() {
    try {
        // Load presets from preferences using Cavalry's preference system
        if (api.hasPreferenceObject("easey_presets")) {
            var savedPresets = api.getPreferenceObject("easey_presets");
            if (savedPresets !== null && savedPresets !== undefined) {
                // COMPLETE REPLACEMENT: This respects when user has deleted all presets
                // If user deleted all presets, savedPresets will be empty object {}
                // This prevents default presets from reappearing after "Delete All"
                presets = savedPresets;
            }
        } else {
            // First time running - save the default presets to establish baseline
            savePresets();
        }
        
        // Load apply on drag setting
        if (api.hasPreferenceObject("easey_applyOnDrag")) {
            var savedApplyOnDrag = api.getPreferenceObject("easey_applyOnDrag");
            if (savedApplyOnDrag !== null && savedApplyOnDrag !== undefined) {
                applyOnDragEnabled = savedApplyOnDrag;
            }
        }
        
    } catch (e) {
        console.log("Could not load presets from preferences:", e.message);
    }
}

// Function to populate preset dropdown with presets only
function populatePresetDropdown() {
    presetList.clear();
    
    // Add "Select a preset..." as the first option
    presetList.addEntry("Select a preset...");
    
    // Add separator after the first option
    presetList.insertSeparator(1);
    
    // Get preset names and sort them alphabetically (case-insensitive)
    var presetNames = Object.keys(presets);
    presetNames.sort(function(a, b) {
        return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    
    // Add all presets in alphabetical order
    for (var i = 0; i < presetNames.length; i++) {
        presetList.addEntry(presetNames[i]);
    }
}

// Initialize preset list
loadSavedPresets();
populatePresetDropdown();

// Create main layout to hold shared controls and tabs
var mainLayout = new ui.VLayout();
mainLayout.setSpaceBetween(0);
mainLayout.setMargins(3, 3, 3, 3);

// Add preset section at the top (shared across tabs)
var presetRow = new ui.HLayout();
presetRow.add(presetList);
presetRow.add(presetContextButton);
presetRow.setMargins(0, 4, 0, 0);

// Create TabView for Value and Speed tabs
var tabView = new ui.TabView();

// VALUE TAB - Existing cubic-bezier graph
var valueTabLayout = new ui.VLayout();
valueTabLayout.setSpaceBetween(0);
valueTabLayout.setMargins(0, 0, 0, 0);

// Add the value graph canvas
valueTabLayout.add(graphCanvas);
valueTabLayout.addStretch();

// SPEED TAB - After Effects-style speed graph
var speedTabLayout = new ui.VLayout();
speedTabLayout.setSpaceBetween(0);
speedTabLayout.setMargins(0, 0, 0, 0);

// Add the speed graph canvas
speedTabLayout.add(speedGraphCanvas);
speedTabLayout.addStretch();

// Add tabs to TabView (Speed first to match After Effects workflow)
tabView.add("Speed", speedTabLayout);
tabView.add("Value", valueTabLayout);

// Add TabView to main layout
mainLayout.add(tabView);

// Add control buttons at the bottom (shared across tabs)
var buttonRow = new ui.HLayout();
buttonRow.add(getButton);
buttonRow.add(bezierInput);
buttonRow.add(applyButton);
buttonRow.setSpaceBetween(4);
buttonRow.setMargins(0, 4, 0, 0);
mainLayout.add(buttonRow);
mainLayout.add(presetRow);


mainLayout.addStretch();

// Add the main layout to the UI
ui.add(mainLayout);
ui.setBackgroundColor(ui.getThemeColor("Base"));

// Export/import functionality moved to dropdown menu

// Initialize the display
updateTextInput();
drawCurve();

// Initialize speed graph
syncValueToSpeed();
drawSpeedCurve();

// Add tab change handler with Y-value backup/restore
tabView.onTabChanged = function() {
    var currentTab = tabView.currentTab();
    console.log(currentTab);
    
    if (currentTab === 0) {
        // Switched to Speed tab
        // Backup current Y values
        backupYValues = {
            y1: currentEasing.y1,
            y2: currentEasing.y2
        };
        // Reset modification flag
        speedGraphModified = false;
        // Normalize Y values for speed mode FIRST
        currentEasing.y1 = 0;
        currentEasing.y2 = 1;
        // Then sync speed handles based on normalized values
        syncValueToSpeed();
        updateTextInput();
        drawCurve();
        drawSpeedCurve();  // Ensure velocity curve is drawn
    } else if (currentTab === 1) {
        // Switched to Value tab
        // If speed graph wasn't modified, restore backup Y values
        if (backupYValues !== null && !speedGraphModified) {
            currentEasing.y1 = backupYValues.y1;
            currentEasing.y2 = backupYValues.y2;
            updateTextInput();
        }
        drawCurve();
        // Clear backup and reset flag
        backupYValues = null;
        speedGraphModified = false;
    }
};

// Set minimum window size but allow resizing
ui.setMinimumWidth(graphWidth);
ui.setMinimumHeight(graphHeight + 60); // Add space for buttons and text input

// Shift key detection now uses api.isShiftHeld() - no custom tracking needed

// Show the window
ui.show();

