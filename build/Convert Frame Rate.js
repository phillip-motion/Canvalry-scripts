// src/Convert Frame Rate.js
var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "Convert Frame Rate";
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
var currentFps = 25;
var activeComp = null;
function main() {
  createUI();
}
function createUI() {
  ui.setTitle("Convert Frame Rate");
  var hLayout1 = new ui.HLayout();
  var fpsInput = new ui.LineEdit();
  fpsInput.setPlaceholder("Enter new frame rate...");
  hLayout1.add(fpsInput);
  var applyButton = new ui.Button("Apply");
  applyButton.onClick = function() {
    var newFpsString = fpsInput.getText().trim();
    if (!newFpsString || newFpsString === "") {
      console.log("Please enter a frame rate value.");
      return;
    }
    var newFps = parseFloat(newFpsString);
    if (isNaN(newFps) || newFps <= 0 || newFps > 120) {
      console.log("Error: Invalid frame rate. Please enter a number between 1 and 120.");
      return;
    }
    convertFrameRate(newFps);
  };
  hLayout1.add(applyButton);
  ui.add(hLayout1);
  var instructions = new ui.Label("NOTE: Modifiers and procedural elements need manual adjustment.");
  instructions.setTextColor(ui.getThemeColor("Light"));
  ui.add(instructions);
  ui.addStretch();
  ui.show();
}
main();
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
  } catch (e) {
    console.log("Could not get current FPS, using default 25");
    currentFps = 25;
  }
  try {
    var ratio = targetFps / currentFps;
    var currentPlayheadFrame = api.getFrame();
    var allLayers = [];
    try {
      allLayers = api.getCompLayers(false);
    } catch (e) {
      return;
    }
    var processedLayers = 0;
    var totalKeyframes = 0;
    for (var i = 0; i < allLayers.length; i++) {
      var layerId = allLayers[i];
      if (!api.layerExists(layerId)) {
        continue;
      }
      try {
        var inFrame = api.getInFrame(layerId);
        var outFrame = api.getOutFrame(layerId);
        var compEndFrame = api.get(activeComp, "endFrame");
        if (inFrame !== 0 || outFrame !== compEndFrame) {
          var newInFrame = Math.round(inFrame * ratio);
          var newOutFrame = Math.round(outFrame * ratio);
          api.setInFrame(layerId, newInFrame);
          api.setOutFrame(layerId, newOutFrame);
        }
      } catch (e) {
      }
      var animatedAttrs = [];
      try {
        animatedAttrs = api.getAnimatedAttributes(layerId);
      } catch (e) {
        continue;
      }
      for (var attrIdx = 0; attrIdx < animatedAttrs.length; attrIdx++) {
        var attrId = animatedAttrs[attrIdx];
        try {
          var keyframeTimes = api.getKeyframeTimes(layerId, attrId);
          var keyframeIds = api.getKeyframeIdsForAttribute(layerId, attrId);
          if (!keyframeTimes || keyframeTimes.length === 0) {
            continue;
          }
          if (keyframeTimes.length < 2) {
            continue;
          }
          var keyframeDataArray = [];
          for (var keyIdx = 0; keyIdx < keyframeTimes.length; keyIdx++) {
            var oldFrame = keyframeTimes[keyIdx];
            var keyframeId = keyframeIds[keyIdx];
            var exactNewFrame = oldFrame * ratio;
            var newFrame = Math.round(exactNewFrame);
            var keyframeInfo = {
              oldFrame,
              exactNewFrame,
              // Store exact value
              newFrame,
              keyframeId,
              keyData: null
            };
            try {
              keyframeInfo.keyData = api.get(keyframeId, "data");
            } catch (e) {
            }
            keyframeDataArray.push(keyframeInfo);
          }
          for (var keyIdx = 1; keyIdx < keyframeDataArray.length; keyIdx++) {
            var prevKey = keyframeDataArray[keyIdx - 1];
            var currKey = keyframeDataArray[keyIdx];
            if (currKey.newFrame <= prevKey.newFrame) {
              var prevDistance = Math.abs(prevKey.newFrame - prevKey.exactNewFrame);
              var currDistance = Math.abs(currKey.newFrame - currKey.exactNewFrame);
              if (prevDistance <= currDistance) {
                currKey.newFrame = prevKey.newFrame + 1;
              } else {
                prevKey.newFrame = currKey.newFrame - 1;
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
          for (var keyIdx = keyframeDataArray.length - 1; keyIdx >= 0; keyIdx--) {
            var keyInfo = keyframeDataArray[keyIdx];
            var modifyObj = {};
            modifyObj[attrId] = {
              "frame": keyInfo.oldFrame,
              "newFrame": keyInfo.newFrame
            };
            api.modifyKeyframe(layerId, modifyObj);
            totalKeyframes++;
          }
          var freshKeyframeTimes = api.getKeyframeTimes(layerId, attrId);
          var freshKeyframeIds = api.getKeyframeIdsForAttribute(layerId, attrId);
          for (var keyIdx = 0; keyIdx < keyframeDataArray.length - 1; keyIdx++) {
            var currentKeyInfo = keyframeDataArray[keyIdx];
            var nextKeyInfo = keyframeDataArray[keyIdx + 1];
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
            if (!currentFreshId || !nextFreshId) {
              continue;
            }
            if (currentKeyInfo.keyData && currentKeyInfo.keyData.interpolation === 0 && nextKeyInfo.keyData && nextKeyInfo.keyData.interpolation === 0) {
              try {
                var originalFrameDiff = nextKeyInfo.oldFrame - currentKeyInfo.oldFrame;
                var originalValueDiff = nextKeyInfo.keyData.numValue - currentKeyInfo.keyData.numValue;
                var outHandleX = currentKeyInfo.keyData.rightBez ? currentKeyInfo.keyData.rightBez.x : 0;
                var outHandleY = currentKeyInfo.keyData.rightBez ? currentKeyInfo.keyData.rightBez.y : 0;
                var inHandleX = nextKeyInfo.keyData.leftBez ? nextKeyInfo.keyData.leftBez.x : 0;
                var inHandleY = nextKeyInfo.keyData.leftBez ? nextKeyInfo.keyData.leftBez.y : 0;
                if (originalFrameDiff === 0) {
                  continue;
                }
                var x1 = outHandleX / originalFrameDiff;
                var y1 = Math.abs(originalValueDiff) > 1e-3 ? outHandleY / originalValueDiff : 0;
                var x2 = (originalFrameDiff + inHandleX) / originalFrameDiff;
                var y2 = Math.abs(originalValueDiff) > 1e-3 ? 1 + inHandleY / originalValueDiff : 1;
                var newFrameDiff = nextKeyInfo.newFrame - currentKeyInfo.newFrame;
                var newValueDiff = nextKeyInfo.keyData.numValue - currentKeyInfo.keyData.numValue;
                var newOutHandleX = x1 * newFrameDiff;
                var newOutHandleY = y1 * newValueDiff;
                var newInHandleX = (x2 - 1) * newFrameDiff;
                var newInHandleY = (y2 - 1) * newValueDiff;
                try {
                  var tangentObj1 = {};
                  tangentObj1[attrId] = {
                    "frame": currentKeyInfo.newFrame,
                    "inHandle": false,
                    "outHandle": true,
                    "xValue": currentKeyInfo.newFrame + newOutHandleX,
                    // Absolute position
                    "yValue": currentKeyInfo.keyData.numValue + newOutHandleY,
                    // Absolute value
                    "angleLocked": false,
                    "weightLocked": false
                  };
                  api.modifyKeyframeTangent(layerId, tangentObj1);
                } catch (e) {
                }
                try {
                  var tangentObj2 = {};
                  tangentObj2[attrId] = {
                    "frame": nextKeyInfo.newFrame,
                    "inHandle": true,
                    "outHandle": false,
                    "xValue": nextKeyInfo.newFrame + newInHandleX,
                    // Absolute position
                    "yValue": nextKeyInfo.keyData.numValue + newInHandleY,
                    // Absolute value
                    "angleLocked": false,
                    "weightLocked": false
                  };
                  api.modifyKeyframeTangent(layerId, tangentObj2);
                } catch (e) {
                }
              } catch (e) {
              }
            }
          }
        } catch (e) {
        }
      }
      processedLayers++;
    }
    console.log("=== Checking for Auto Animate and Frame behaviors ===");
    for (var i = 0; i < allLayers.length; i++) {
      var layerId = allLayers[i];
      if (!api.layerExists(layerId)) {
        continue;
      }
      try {
        var layerType = api.getType(layerId);
        if (layerType === "autoAnimate" || layerType === "frame") {
          console.log("Found " + layerType + " layer: " + layerId);
        }
        if (layerType === "autoAnimate") {
          console.log("Processing Auto Animate layer: " + layerId);
          try {
            var timeOffsetKeyframes = api.getKeyframeTimes(layerId, "timeOffset");
            var isTimeOffsetAnimated = timeOffsetKeyframes && timeOffsetKeyframes.length > 0;
            if (!isTimeOffsetAnimated) {
              var currentTimeOffset = api.get(layerId, "timeOffset");
              var newTimeOffset = currentTimeOffset * ratio;
              api.set(layerId, { "timeOffset": newTimeOffset });
              console.log("  - Adjusted timeOffset: " + currentTimeOffset + " \u2192 " + newTimeOffset);
            } else {
              console.log("  - Skipped timeOffset (animated)");
            }
          } catch (e) {
            console.log("  - Error adjusting timeOffset: " + e.message);
          }
        }
        if (layerType === "frame") {
          console.log("Processing Frame behavior: " + layerId);
          try {
            var interpMode;
            try {
              interpMode = api.get(layerId, "mode");
            } catch (e) {
              interpMode = 0;
            }
            console.log("  - Interpolation mode: " + (interpMode === 0 ? "Frame" : "Seconds"));
            if (interpMode === 0) {
              var valueKeyframes = api.getKeyframeTimes(layerId, "value");
              var offsetKeyframes = api.getKeyframeTimes(layerId, "offset");
              var startFrameKeyframes = api.getKeyframeTimes(layerId, "startFrame");
              var isValueAnimated = valueKeyframes && valueKeyframes.length > 0;
              var isOffsetAnimated = offsetKeyframes && offsetKeyframes.length > 0;
              var isStartFrameAnimated = startFrameKeyframes && startFrameKeyframes.length > 0;
              if (!isValueAnimated) {
                try {
                  var currentValue = api.get(layerId, "value");
                  var newValue = currentValue / ratio;
                  api.set(layerId, { "value": newValue });
                  console.log("  - Adjusted value: " + currentValue + " \u2192 " + newValue);
                } catch (e) {
                  console.log("  - Error adjusting value: " + e.message);
                }
              } else {
                console.log("  - Skipped value (animated)");
              }
              if (!isOffsetAnimated) {
                try {
                  var currentOffset = api.get(layerId, "offset");
                  var newOffset = currentOffset * ratio;
                  api.set(layerId, { "offset": newOffset });
                  console.log("  - Adjusted offset: " + currentOffset + " \u2192 " + newOffset);
                } catch (e) {
                  console.log("  - Error adjusting offset: " + e.message);
                }
              } else {
                console.log("  - Skipped offset (animated)");
              }
              if (!isStartFrameAnimated) {
                try {
                  var currentStartFrame = api.get(layerId, "startFrame");
                  var newStartFrame = Math.round(currentStartFrame * ratio);
                  api.set(layerId, { "startFrame": newStartFrame });
                  console.log("  - Adjusted startFrame: " + currentStartFrame + " \u2192 " + newStartFrame);
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
      }
    }
    var currentStartFrame, currentEndFrame, currentPlaybackStart, currentPlaybackEnd;
    try {
      currentStartFrame = api.get(activeComp, "startFrame");
      currentEndFrame = api.get(activeComp, "endFrame");
      currentPlaybackStart = api.get(activeComp, "playbackStart");
      currentPlaybackEnd = api.get(activeComp, "playbackEnd");
    } catch (e) {
    }
    try {
      api.set(activeComp, { "fps": targetFps });
      console.log("Frame rate changed from " + currentFps + " to " + targetFps + " fps");
    } catch (e) {
    }
    try {
      var newStartFrame = Math.round(currentStartFrame * ratio);
      var newEndFrame = Math.round(currentEndFrame * ratio);
      api.set(activeComp, { "startFrame": newStartFrame, "endFrame": newEndFrame });
    } catch (e) {
    }
    try {
      if (currentPlaybackStart !== void 0 && currentPlaybackEnd !== void 0 && currentPlaybackStart !== null && currentPlaybackEnd !== null) {
        var newPlaybackStart = Math.round(currentPlaybackStart * ratio);
        var newPlaybackEnd = Math.round(currentPlaybackEnd * ratio);
        api.set(activeComp, { "playbackStart": newPlaybackStart, "playbackEnd": newPlaybackEnd });
      }
    } catch (e) {
    }
    currentFps = targetFps;
    try {
      var newPlayheadFrame = Math.round(currentPlayheadFrame * ratio);
      api.setFrame(newPlayheadFrame);
      console.log("Playhead moved from frame " + currentPlayheadFrame + " to frame " + newPlayheadFrame);
    } catch (e) {
      console.log("Could not restore playhead position");
    }
  } catch (e) {
    try {
      api.setFrame(currentPlayheadFrame);
    } catch (e2) {
    }
  }
}
