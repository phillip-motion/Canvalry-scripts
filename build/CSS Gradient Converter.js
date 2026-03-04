// src/CSS Gradient Converter.js
ui.setTitle("CSS Gradient to Cavalry Converter");
var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "CSS Gradient Converter";
var currentVersion = "1.0.0";
function compareVersions(v1, v2) {
  var parts1 = v1.split(".").map(function(n) {
    return parseInt(n, 10) || 0;
  });
  var parts2 = v2.split(".").map(function(n) {
    return parseInt(n, 10) || 0;
  });
  for (var i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    var num1 = parts1[i] || 0;
    var num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}
function checkForUpdate(githubRepo, scriptName2, currentVersion2, callback) {
  var now = (/* @__PURE__ */ new Date()).getTime();
  var oneDayAgo = now - 24 * 60 * 60 * 1e3;
  var shouldFetchFromGithub = true;
  var cachedLatestVersion = null;
  if (api.hasPreferenceObject(scriptName2 + "_update_check")) {
    var prefs = api.getPreferenceObject(scriptName2 + "_update_check");
    cachedLatestVersion = prefs.latestVersion;
    if (prefs.lastCheck && prefs.lastCheck > oneDayAgo) {
      shouldFetchFromGithub = false;
    }
  }
  if (!shouldFetchFromGithub && cachedLatestVersion) {
    var updateAvailable = compareVersions(cachedLatestVersion, currentVersion2) > 0;
    if (updateAvailable) {
      console.warn(scriptName2 + " " + cachedLatestVersion + " update available (you have " + currentVersion2 + "). Download at github.com/" + githubRepo);
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
      var latestVersion = versions[scriptName2];
      if (!latestVersion) {
        console.warn("Version check: Script name '" + scriptName2 + "' not found in versions.json");
        if (callback) callback(false);
        return;
      }
      if (latestVersion.startsWith("v")) {
        latestVersion = latestVersion.substring(1);
      }
      api.setPreferenceObject(scriptName2 + "_update_check", {
        lastCheck: (/* @__PURE__ */ new Date()).getTime(),
        latestVersion
      });
      var updateAvailable = compareVersions(latestVersion, currentVersion2) > 0;
      if (updateAvailable) {
        console.warn(scriptName2 + " " + latestVersion + " update available (you have " + currentVersion2 + "). Download at github.com/" + githubRepo);
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
var gradientInput = new ui.MultiLineEdit();
gradientInput.setPlaceholder("Paste CSS here with linear-gradient properties...");
var applyButton = new ui.Button("Apply Gradient");
applyButton.onClick = function() {
  var cssGradient = gradientInput.getText();
  if (cssGradient.trim() === "") {
    console.log("Please enter a CSS gradient");
    return;
  }
  var gradientDataArray = parseCSSGradients(cssGradient);
  if (gradientDataArray && gradientDataArray.length > 0) {
    createCavalryGradients(gradientDataArray);
  } else {
    console.log("Error: Could not find any valid gradients. Please check the format.");
  }
};
ui.add(gradientInput);
ui.addSpacing(10);
ui.add(applyButton);
ui.show();
function parseCSSGradients(cssString) {
  try {
    var gradients = [];
    var gradientMatches = cssString.match(/linear-gradient\s*\([^)]+\)/g);
    if (!gradientMatches || gradientMatches.length === 0) {
      throw new Error("No linear-gradient found");
    }
    for (var g = 0; g < gradientMatches.length; g++) {
      var gradientString = gradientMatches[g];
      var match = gradientString.match(/linear-gradient\s*\(\s*([^)]+)\s*\)/);
      if (!match) continue;
      var gradientContent = match[1];
      var parts = gradientContent.split(",").map(function(part) {
        return part.trim();
      });
      var angle = parseFloat(parts[0].replace("deg", ""));
      var stops = [];
      for (var i = 1; i < parts.length; i++) {
        var stopMatch = parts[i].match(/^(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)\s+(-?\d*\.?\d+)%?$/);
        if (stopMatch) {
          var color = stopMatch[1];
          var position = parseFloat(stopMatch[2]);
          position = position / 100;
          stops.push({
            color,
            position
          });
        }
      }
      if (stops.length > 0) {
        gradients.push({
          angle,
          stops
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
      var gradientName = gradientDataArray.length > 1 ? "CSS Gradient " + (g + 1) : "CSS Gradient";
      var gradientId = api.create("gradientShader", gradientName);
      api.set(gradientId, { "generator": "linearGradientShader" });
      var cavalryRotation = gradientData.angle - 270;
      api.set(gradientId, { "generator.rotation": cavalryRotation });
      var colors = gradientData.stops.map(function(stop2) {
        return stop2.color;
      });
      api.setGradientFromColors(gradientId, "generator.gradient", colors);
      for (var i = 0; i < gradientData.stops.length; i++) {
        var stop = gradientData.stops[i];
        var positionAttr = "generator.gradient." + i + ".position";
        var colorAttr = "generator.gradient." + i + ".color";
        var positionObj = {};
        positionObj[positionAttr] = stop.position;
        api.set(gradientId, positionObj);
        var colorObj = {};
        colorObj[colorAttr] = stop.color;
        api.set(gradientId, colorObj);
      }
      createdGradients.push(gradientId);
      console.log("Created gradient shader '" + gradientName + "' with " + gradientData.stops.length + " stops");
    }
    console.log("Total gradients created: " + createdGradients.length);
    if (selectedLayers && selectedLayers.length > 0) {
      console.log("Applying gradients to " + selectedLayers.length + " selected layers");
      for (var l = 0; l < selectedLayers.length; l++) {
        var layerId = selectedLayers[l];
        api.set(layerId, { "material": true });
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
      api.select(createdGradients);
    }
  } catch (error) {
    console.log("Error creating gradients: " + error.message);
  }
}
