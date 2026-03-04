// src/Find and Replace Text.js
ui.setTitle("Find and Replace Text");
function extractPlainText(textValue) {
  if (!textValue) return "";
  if (typeof textValue === "object" && textValue.value !== void 0) {
    return extractPlainText(textValue.value);
  }
  if (typeof textValue === "object" && textValue.text !== void 0) {
    return textValue.text;
  }
  return String(textValue);
}
function getAllTextFromComp(compId) {
  var textEntries = [];
  try {
    api.setActiveComp(compId);
    var compName = api.getNiceName(compId);
    var textShapes = api.getCompLayersOfType(false, "textShape");
    for (var i = 0; i < textShapes.length; i++) {
      var layerId = textShapes[i];
      try {
        var textValue = api.get(layerId, "text");
        var plainText = extractPlainText(textValue);
        var layerName = api.getNiceName(layerId);
        textEntries.push({
          compId,
          compName,
          layerId,
          layerName,
          overrideIndex: null,
          text: plainText,
          displayName: compName + " > " + layerName
        });
      } catch (e) {
        console.warn("Failed to get text from layer " + layerId + ": " + e);
      }
    }
    var compRefs = api.getCompLayersOfType(false, "compositionReference");
    for (var j = 0; j < compRefs.length; j++) {
      var refLayerId = compRefs[j];
      var refLayerName = api.getNiceName(refLayerId);
      var overrideIndex = 0;
      var maxOverrides = 50;
      while (overrideIndex < maxOverrides) {
        if (!api.hasAttribute(refLayerId, "overrides." + overrideIndex)) {
          break;
        }
        var richTextPath = "overrides." + overrideIndex + ".richText";
        if (api.hasAttribute(refLayerId, richTextPath)) {
          var richTextValue = api.get(refLayerId, richTextPath);
          if (richTextValue) {
            var overrideText = extractPlainText(richTextValue);
            if (overrideText) {
              textEntries.push({
                compId,
                compName,
                layerId: refLayerId,
                layerName: refLayerName,
                overrideIndex,
                text: overrideText,
                displayName: compName + " > " + refLayerName + " [override " + overrideIndex + "]"
              });
            }
          }
        }
        overrideIndex++;
      }
    }
  } catch (e) {
    console.error("Failed to process composition " + compId + ": " + e);
  }
  return textEntries;
}
function getAllTextFromProject() {
  var allEntries = [];
  var allComps = api.getComps();
  var originalActiveComp = api.getActiveComp();
  for (var i = 0; i < allComps.length; i++) {
    var compEntries = getAllTextFromComp(allComps[i]);
    allEntries = allEntries.concat(compEntries);
  }
  if (originalActiveComp) {
    api.setActiveComp(originalActiveComp);
  }
  return allEntries;
}
function buildSearchPattern(searchText, useRegex, caseSensitive) {
  if (!searchText) return null;
  try {
    var flags = caseSensitive ? "g" : "gi";
    if (useRegex) {
      return new RegExp(searchText, flags);
    } else {
      var escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped, flags);
    }
  } catch (e) {
    console.error("Invalid regex pattern: " + e);
    return null;
  }
}
function findMatches(textEntries, searchPattern) {
  var matches = [];
  for (var i = 0; i < textEntries.length; i++) {
    var entry = textEntries[i];
    searchPattern.lastIndex = 0;
    if (searchPattern.test(entry.text)) {
      searchPattern.lastIndex = 0;
      var matchCount = (entry.text.match(searchPattern) || []).length;
      matches.push({
        entry,
        matchCount
      });
    }
  }
  return matches;
}
function replaceTextInEntry(entry, searchPattern, replaceText) {
  try {
    var newText = entry.text.replace(searchPattern, replaceText);
    if (newText === entry.text) {
      return { success: true, changed: false };
    }
    api.setActiveComp(entry.compId);
    if (entry.overrideIndex === null) {
      api.set(entry.layerId, { "text": newText });
    } else {
      var overridePath = "overrides." + entry.overrideIndex + ".richText";
      var richTextValue = {
        text: newText,
        overrides: [{
          start: 0,
          end: newText.length,
          features: { calt: 1, clig: 1, liga: 1 }
        }]
      };
      var setObj = {};
      setObj[overridePath] = richTextValue;
      api.set(entry.layerId, setObj);
    }
    return { success: true, changed: true };
  } catch (e) {
    console.error("Failed to replace text in " + entry.displayName + ": " + e);
    return { success: false, changed: false, error: e.toString() };
  }
}
var findInput = new ui.LineEdit();
findInput.setPlaceholder("Search text or regex pattern...");
var replaceInput = new ui.LineEdit();
replaceInput.setPlaceholder("Replacement text...");
var caseSensitiveCheckbox = new ui.Checkbox(false);
var useRegexCheckbox = new ui.Checkbox(false);
var findButton = new ui.Button("Find All");
findButton.setToolTip("Search all text layers and overrides");
var replaceAllButton = new ui.Button("Replace All");
replaceAllButton.setToolTip("Replace all matches across the project");
var resultsScrollView = new ui.ScrollView();
resultsScrollView.setFixedHeight(200);
var resultsContainer;
var resultsColumn;
var statusLabel = new ui.Label("Enter search text and click 'Find All'");
statusLabel.setTextColor(ui.getThemeColor("Light"));
var currentMatches = [];
var currentSearchPattern = null;
function clearResultsTable() {
  resultsColumn = new ui.VLayout();
  resultsColumn.setSpaceBetween(4);
  resultsContainer = new ui.VLayout();
  resultsContainer.setSpaceBetween(0);
  resultsContainer.add(resultsColumn);
  resultsScrollView.setLayout(resultsContainer);
}
function highlightMatches(text, pattern) {
  pattern.lastIndex = 0;
  var matches = text.match(pattern);
  if (matches && matches.length > 0) {
    if (text.length > 80) {
      pattern.lastIndex = 0;
      var firstMatchIndex = text.search(pattern);
      var start = Math.max(0, firstMatchIndex - 20);
      var end = Math.min(text.length, firstMatchIndex + 60);
      var snippet = (start > 0 ? "..." : "") + text.substring(start, end) + (end < text.length ? "..." : "");
      return snippet;
    }
    return text;
  }
  return text;
}
function populateResults(matches, pattern) {
  clearResultsTable();
  if (matches.length === 0) {
    var noResultsLabel = new ui.Label("No matches found");
    noResultsLabel.setTextColor(ui.getThemeColor("Light"));
    resultsColumn.add(noResultsLabel);
    return;
  }
  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    var locationLabel = new ui.Label(match.entry.displayName);
    locationLabel.setTextColor(ui.getThemeColor("Accent1"));
    resultsColumn.add(locationLabel);
    var previewText = highlightMatches(match.entry.text, pattern);
    var textLabel = new ui.Label('  "' + previewText + '"');
    textLabel.setTextColor(ui.getThemeColor("Text"));
    resultsColumn.add(textLabel);
    var countLabel = new ui.Label("  " + match.matchCount + " match" + (match.matchCount > 1 ? "es" : ""));
    countLabel.setTextColor(ui.getThemeColor("Midlight"));
    resultsColumn.add(countLabel);
    if (i < matches.length - 1) {
      resultsColumn.addSpacing(8);
    }
  }
}
function performFind() {
  var searchText = findInput.getText();
  if (!searchText || searchText.trim() === "") {
    statusLabel.setText("Please enter search text");
    statusLabel.setTextColor("#ff6666");
    clearResultsTable();
    currentMatches = [];
    currentSearchPattern = null;
    return;
  }
  var caseSensitive = caseSensitiveCheckbox.getValue();
  var useRegex = useRegexCheckbox.getValue();
  var pattern = buildSearchPattern(searchText, useRegex, caseSensitive);
  if (!pattern) {
    statusLabel.setText("Invalid regex pattern");
    statusLabel.setTextColor("#ff6666");
    clearResultsTable();
    currentMatches = [];
    currentSearchPattern = null;
    return;
  }
  statusLabel.setText("Searching...");
  statusLabel.setTextColor(ui.getThemeColor("Light"));
  var allTextEntries = getAllTextFromProject();
  if (allTextEntries.length === 0) {
    statusLabel.setText("No text layers found in project");
    statusLabel.setTextColor(ui.getThemeColor("Light"));
    clearResultsTable();
    currentMatches = [];
    currentSearchPattern = null;
    return;
  }
  var matches = findMatches(allTextEntries, pattern);
  currentMatches = matches;
  currentSearchPattern = pattern;
  populateResults(matches, pattern);
  var totalMatchCount = 0;
  for (var i = 0; i < matches.length; i++) {
    totalMatchCount += matches[i].matchCount;
  }
  if (matches.length === 0) {
    statusLabel.setText("No matches found (searched " + allTextEntries.length + " text entries)");
    statusLabel.setTextColor(ui.getThemeColor("Light"));
  } else {
    statusLabel.setText("Found " + totalMatchCount + " match" + (totalMatchCount > 1 ? "es" : "") + " in " + matches.length + " text layer" + (matches.length > 1 ? "s" : ""));
    statusLabel.setTextColor(ui.getThemeColor("Accent1"));
  }
}
function performReplaceAll() {
  var searchText = findInput.getText();
  var replaceText = replaceInput.getText();
  if (!searchText || searchText.trim() === "") {
    statusLabel.setText("Please enter search text");
    statusLabel.setTextColor("#ff6666");
    return;
  }
  var caseSensitive = caseSensitiveCheckbox.getValue();
  var useRegex = useRegexCheckbox.getValue();
  var pattern = buildSearchPattern(searchText, useRegex, caseSensitive);
  if (!pattern) {
    statusLabel.setText("Invalid regex pattern");
    statusLabel.setTextColor("#ff6666");
    return;
  }
  statusLabel.setText("Replacing...");
  statusLabel.setTextColor(ui.getThemeColor("Light"));
  var allTextEntries = getAllTextFromProject();
  var matches = findMatches(allTextEntries, pattern);
  if (matches.length === 0) {
    statusLabel.setText("No matches found to replace");
    statusLabel.setTextColor(ui.getThemeColor("Light"));
    return;
  }
  var originalActiveComp = api.getActiveComp();
  var successCount = 0;
  var failCount = 0;
  var totalReplacements = 0;
  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    var replacePattern = buildSearchPattern(searchText, useRegex, caseSensitive);
    var result = replaceTextInEntry(match.entry, replacePattern, replaceText);
    if (result.success && result.changed) {
      successCount++;
      totalReplacements += match.matchCount;
    } else if (!result.success) {
      failCount++;
    }
  }
  if (originalActiveComp) {
    api.setActiveComp(originalActiveComp);
  }
  var statusMsg = "Replaced " + totalReplacements + " occurrence" + (totalReplacements > 1 ? "s" : "") + " in " + successCount + " text layer" + (successCount > 1 ? "s" : "");
  if (failCount > 0) {
    statusMsg += " (" + failCount + " failed)";
  }
  statusLabel.setText(statusMsg);
  statusLabel.setTextColor(ui.getThemeColor("Accent1"));
  clearResultsTable();
  currentMatches = [];
  currentSearchPattern = null;
  console.log("Replace complete: " + statusMsg);
}
var mainLayout = new ui.VLayout();
mainLayout.setMargins(10, 10, 10, 10);
mainLayout.setSpaceBetween(8);
var findLabel = new ui.Label("Find");
findLabel.setTextColor(ui.getThemeColor("Light"));
findLabel.setMinimumWidth(55);
var findRow = new ui.HLayout();
findRow.add(findLabel);
findRow.add(findInput);
mainLayout.add(findRow);
var replaceLabel = new ui.Label("Replace");
replaceLabel.setTextColor(ui.getThemeColor("Light"));
replaceLabel.setMinimumWidth(55);
var replaceRow = new ui.HLayout();
replaceRow.add(replaceLabel);
replaceRow.add(replaceInput);
mainLayout.add(replaceRow);
var optionsRow = new ui.HLayout();
optionsRow.setSpaceBetween(16);
var caseSensitiveLabel = new ui.Label("Case sensitive");
caseSensitiveLabel.setTextColor(ui.getThemeColor("Light"));
var caseRow = new ui.HLayout();
caseRow.setSpaceBetween(4);
caseRow.add(caseSensitiveCheckbox);
caseRow.add(caseSensitiveLabel);
var regexLabel = new ui.Label("Use regex");
regexLabel.setTextColor(ui.getThemeColor("Light"));
var regexRow = new ui.HLayout();
regexRow.setSpaceBetween(4);
regexRow.add(useRegexCheckbox);
regexRow.add(regexLabel);
optionsRow.add(caseRow);
optionsRow.add(regexRow);
optionsRow.addStretch();
mainLayout.add(optionsRow);
var buttonsRow = new ui.HLayout();
buttonsRow.setSpaceBetween(8);
buttonsRow.add(findButton);
buttonsRow.add(replaceAllButton);
mainLayout.add(buttonsRow);
mainLayout.addSpacing(4);
var resultsLabel = new ui.Label("Results");
resultsLabel.setTextColor(ui.getThemeColor("Light"));
mainLayout.add(resultsLabel);
mainLayout.add(resultsScrollView);
mainLayout.addSpacing(4);
mainLayout.add(statusLabel);
mainLayout.addStretch();
findButton.onClick = function() {
  performFind();
};
replaceAllButton.onClick = function() {
  performReplaceAll();
};
findInput.onReturnPressed = function() {
  performFind();
};
clearResultsTable();
ui.add(mainLayout);
ui.setMinimumWidth(350);
ui.setMinimumHeight(400);
ui.show();
console.log("Find and Replace Text plugin loaded");
var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "Find and Replace Text";
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
      if (callback) callback(false);
    }
  } catch (e) {
    if (callback) callback(false);
  }
}
checkForUpdate(GITHUB_REPO, scriptName, currentVersion);
