// Set the window title
ui.setTitle("CSS Gradient to Cavalry Converter");


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
var scriptName = "CSS Gradient Converter";  // Must match key your repo's versions.json
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

// Create the gradient input text area
var gradientInput = new ui.MultiLineEdit();
gradientInput.setPlaceholder("Paste CSS here with linear-gradient properties...");

// Create the apply button
var applyButton = new ui.Button("Apply Gradient");

// Set the button callback
applyButton.onClick = function() {
    var cssGradient = gradientInput.getText();
    
    if (cssGradient.trim() === "") {
        console.log("Please enter a CSS gradient");
        return;
    }
    
    // Parse the CSS for gradients
    var gradientDataArray = parseCSSGradients(cssGradient);
    
    if (gradientDataArray && gradientDataArray.length > 0) {
        createCavalryGradients(gradientDataArray);
    } else {
        console.log("Error: Could not find any valid gradients. Please check the format.");
    }
};

// Add widgets to the layout
ui.add(gradientInput);
ui.addSpacing(10);
ui.add(applyButton);

// Show the window
ui.show();

function parseCSSGradients(cssString) {
    try {
        var gradients = [];
        
        // Find all linear-gradient() functions in the text
        var gradientMatches = cssString.match(/linear-gradient\s*\([^)]+\)/g);
        
        if (!gradientMatches || gradientMatches.length === 0) {
            throw new Error("No linear-gradient found");
        }
        
        for (var g = 0; g < gradientMatches.length; g++) {
            var gradientString = gradientMatches[g];
            
            // Extract content inside parentheses
            var match = gradientString.match(/linear-gradient\s*\(\s*([^)]+)\s*\)/);
            if (!match) continue;
            
            var gradientContent = match[1];
            var parts = gradientContent.split(',').map(function(part) { return part.trim(); });
            
            // First part should be the angle
            var angle = parseFloat(parts[0].replace('deg', ''));
            
            // Parse color stops
            var stops = [];
            for (var i = 1; i < parts.length; i++) {
                var stopMatch = parts[i].match(/^(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)\s+(-?\d*\.?\d+)%?$/);
                if (stopMatch) {
                    var color = stopMatch[1];
                    var position = parseFloat(stopMatch[2]);
                    
                    // Convert percentage to 0-1 range
                    position = position / 100.0;
                    
                    stops.push({
                        color: color,
                        position: position
                    });
                }
            }
            
            if (stops.length > 0) {
                gradients.push({
                    angle: angle,
                    stops: stops
                });
            }
        }
        
        return gradients;
        
    } catch (error) {
        console.log("Parse error: " + error.message);
        return null;
    }
}

function createCavalryGradients(gradientDataArray) {
    try {
        var createdGradients = [];
        var selectedLayers = api.getSelection();
        
        for (var g = 0; g < gradientDataArray.length; g++) {
            var gradientData = gradientDataArray[g];
            
            // Create a Gradient Shader with numbered name if multiple gradients
            var gradientName = gradientDataArray.length > 1 ? "CSS Gradient " + (g + 1) : "CSS Gradient";
            var gradientId = api.create("gradientShader", gradientName);
            
            // Set the gradient generator to Linear
            api.set(gradientId, {"generator": "linearGradientShader"});
            
            // Set rotation based on the CSS angle
            // CSS uses 0deg = top, 90deg = right, 180deg = bottom, 270deg = left
            // Cavalry appears to be rotated 180deg from expected, so adjust further
            var cavalryRotation = gradientData.angle - 270; // Convert from CSS angle to Cavalry
            api.set(gradientId, {"generator.rotation": cavalryRotation});
            
            // First, set up the gradient with the correct number of stops using setGradientFromColors
            var colors = gradientData.stops.map(function(stop) { return stop.color; });
            api.setGradientFromColors(gradientId, "generator.gradient", colors);
            
            // Then adjust the positions of each stop
            for (var i = 0; i < gradientData.stops.length; i++) {
                var stop = gradientData.stops[i];
                
                // Set the position for this stop
                var positionAttr = "generator.gradient." + i + ".position";
                var colorAttr = "generator.gradient." + i + ".color";
                
                var positionObj = {};
                positionObj[positionAttr] = stop.position;
                api.set(gradientId, positionObj);
                
                // Ensure the color is set correctly
                var colorObj = {};
                colorObj[colorAttr] = stop.color;
                api.set(gradientId, colorObj);
            }
            
            createdGradients.push(gradientId);
            console.log("Created gradient shader '" + gradientName + "' with " + gradientData.stops.length + " stops");
        }
        
        console.log("Total gradients created: " + createdGradients.length);
        
        // If there are selected layers, apply gradients to their fill
        if (selectedLayers && selectedLayers.length > 0) {
            console.log("Applying gradients to " + selectedLayers.length + " selected layers");
            
            for (var l = 0; l < selectedLayers.length; l++) {
                var layerId = selectedLayers[l];
                
                // Enable fill if it's not already enabled
                api.set(layerId, {"material": true});
                
                // Connect each gradient to the fill shaders using indexed slots
                for (var g = 0; g < createdGradients.length; g++) {
                    var gradientId = createdGradients[g];
                    var shaderSlot = "material.colorShaders." + g + ".shader";
                    try {
                        api.connect(gradientId, "id", layerId, shaderSlot);
                        console.log("Connected gradient " + (g + 1) + " to layer shader slot " + g);
                    } catch (error) {
                        console.log("Could not connect gradient " + (g + 1) + " to layer: " + error.message);
                    }
                }
            }
        } else {
            console.log("No layers selected - gradients created without connections");
            // Select all created gradients
            api.select(createdGradients);
        }
        
    } catch (error) {
        console.log("Error creating gradients: " + error.message);
    }
}