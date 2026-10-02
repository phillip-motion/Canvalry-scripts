// Renamer Script for Cavalry
// Add, Replace, or Number assets or layers

import { tokens, span, richLabel, label, status, button, field, formRow, checkRow, tabStrip, list, panel } from "./lib/ui-kit.js";

var T = tokens();

// Set window title
ui.setTitle("Renamer");

// =============================================================================
// ADD TAB CONTROLS
// =============================================================================
var prependInput = new ui.LineEdit();
prependInput.setPlaceholder("Prepend text...");

var appendInput = new ui.LineEdit();
appendInput.setPlaceholder("Append text...");

var applyAddButton = button("Apply", true, T);

// =============================================================================
// REPLACE TAB CONTROLS (Original functionality)
// =============================================================================
var findInput = new ui.LineEdit();
findInput.setPlaceholder("Text to find...");

var replaceInput = new ui.LineEdit();
replaceInput.setPlaceholder("Replacement text...");

var applyReplaceButton = button("Apply", true, T);

// =============================================================================
// NUMBER TAB CONTROLS
// =============================================================================
var startNumberInput = new ui.LineEdit();
startNumberInput.setPlaceholder("01");
startNumberInput.setText("01");

var positionDropdown = new ui.DropDown();
positionDropdown.addEntry("Append");
positionDropdown.addEntry("Prepend");

var reverseCheckbox = new ui.Checkbox(false);

var applyNumberButton = button("Apply", true, T);

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

var preview = list(200, T);

var statusLabel = status("", T);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function clearPreviewTable() {
    preview.layout.clear();
}

// Detect padding from start number string (1 = no padding, 01 = 2 digits, 001 = 3 digits)
function detectPadding(startStr) {
    var num = parseInt(startStr);
    if (isNaN(num)) return 2; // Default to 2-digit padding if invalid
    if (startStr === num.toString()) return 0; // "1" = no padding
    return startStr.length; // "01" = 2, "001" = 3
}

// Pad number with leading zeros
function padNumber(num, padding) {
    if (padding === 0) return num.toString();
    var str = num.toString();
    while (str.length < padding) {
        str = "0" + str;
    }
    return str;
}

// =============================================================================
// PREVIEW FUNCTION
// =============================================================================
function updatePreview() {
    var selectedAssets = api.getSelection();
    var currentTab = tabs.current();
    
    // Clear the preview table
    clearPreviewTable();
    
    // Update preview title based on selection
    if (selectedAssets.length === 0) {
        previewTitleLabel.setText("Select items and change settings to preview");
        previewTitleLabel.setTextColor(T.muted);
        return;
    }
    
    var changesCount = 0;
    var changesList = []; // Array to store {oldName, newName} objects
    
    // ADD TAB (Tab 0)
    if (currentTab === 0) {
        var prependText = prependInput.getText();
        var appendText = appendInput.getText();
        
        if (prependText === "" && appendText === "") {
            previewTitleLabel.setText("Enter text in Prepend and/or Append fields to see preview.");
            previewTitleLabel.setTextColor(T.muted);
            return;
        }
        
        for (var i = 0; i < selectedAssets.length; i++) {
            var assetId = selectedAssets[i];
            var oldName = api.getNiceName(assetId);
            var newName = prependText + oldName + appendText;
            
            if (newName !== oldName) {
                changesList.push({oldName: oldName, newName: newName});
                changesCount++;
            }
        }
        
        if (changesCount === 0) {
            var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - No changes to apply";
            previewTitleLabel.setText(countText);
            previewTitleLabel.setTextColor(T.muted);
        } else {
            var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - " + changesCount + " will be modified";
            previewTitleLabel.setText(countText);
            previewTitleLabel.setTextColor(T.text);
        }
    }
    
    // REPLACE TAB (Tab 1)
    else if (currentTab === 1) {
        var findText = findInput.getText().trim();
        var replaceText = replaceInput.getText();
        
        if (findText === "") {
            previewTitleLabel.setText("Enter text in the 'Find' field to see preview.");
            previewTitleLabel.setTextColor(T.muted);
            return;
        }
        
        for (var i = 0; i < selectedAssets.length; i++) {
            var assetId = selectedAssets[i];
            var oldName = api.getNiceName(assetId);
            
            if (oldName.indexOf(findText) !== -1) {
                var newName = oldName.split(findText).join(replaceText);
                changesList.push({oldName: oldName, newName: newName});
                changesCount++;
            }
        }
        
        if (changesCount === 0) {
            var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - No matches found";
            previewTitleLabel.setText(countText);
            previewTitleLabel.setTextColor(T.muted);
        } else {
            var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - " + changesCount + " match(es) found";
            previewTitleLabel.setText(countText);
            previewTitleLabel.setTextColor(T.text);
        }
    }
    
    // NUMBER TAB (Tab 2)
    else if (currentTab === 2) {
        var startStr = startNumberInput.getText().trim();
        if (startStr === "") startStr = "01";
        
        var startNum = parseInt(startStr);
        if (isNaN(startNum)) {
            previewTitleLabel.setText("Please enter a valid number.");
            previewTitleLabel.setTextColor(T.error);
            return;
        }
        
        var padding = detectPadding(startStr);
        var position = positionDropdown.getText();
        var reverse = reverseCheckbox.getValue();
        
        // Create working array (potentially reversed)
        var workingAssets = selectedAssets.slice(); // Copy array
        if (reverse) {
            workingAssets.reverse();
        }
        
        for (var i = 0; i < workingAssets.length; i++) {
            var assetId = workingAssets[i];
            var oldName = api.getNiceName(assetId);
            var number = padNumber(startNum + i, padding);
            var newName;
            
            if (position === "Prepend") {
                newName = number + " " + oldName;
            } else {
                newName = oldName + " " + number;
            }
            
            changesList.push({oldName: oldName, newName: newName});
            changesCount++;
        }
        
        if (changesCount > 0) {
            var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - " + changesCount + " will be numbered";
            previewTitleLabel.setText(countText);
            previewTitleLabel.setTextColor(T.text);
        }
    }
    
    // One rich-text line per rename: old name, muted arrow, new name in the accent
    for (var i = 0; i < changesList.length; i++) {
        var line = richLabel(
            span(changesList[i].oldName, { color: T.text }) +
            span("  →  ", { color: T.muted }) +
            span(changesList[i].newName, { color: T.accent })
        );
        line.setFontSize(12);
        preview.layout.add(line);
    }
    preview.layout.addStretch();
}

// =============================================================================
// APPLY FUNCTIONS
// =============================================================================

// Apply Add (Prepend/Append)
function applyAddText() {
    var selectedAssets = api.getSelection();
    var prependText = prependInput.getText();
    var appendText = appendInput.getText();
    
    if (selectedAssets.length === 0) {
        statusLabel.setText("❌ No assets selected!");
        statusLabel.setTextColor(T.error);
        console.warn("No items selected. Please select one or more items in the Assets panel.");
        return;
    }
    
    if (prependText === "" && appendText === "") {
        statusLabel.setText("❌ Enter text to prepend and/or append!");
        statusLabel.setTextColor(T.error);
        console.warn("Please enter text in the Prepend and/or Append fields.");
        return;
    }
    
    var renamedCount = 0;
    
    for (var i = 0; i < selectedAssets.length; i++) {
        var assetId = selectedAssets[i];
        var oldName = api.getNiceName(assetId);
        var newName = prependText + oldName + appendText;
        
        if (newName !== oldName) {
            try {
                api.rename(assetId, newName);
                renamedCount++;
                console.log("Renamed: " + oldName + " → " + newName);
            } catch (e) {
                console.error("Failed to rename: " + oldName + " - " + e.message);
            }
        }
    }
    
    statusLabel.setText("✓ Renamed " + renamedCount + " asset(s)");
    statusLabel.setTextColor(T.accent);
    console.log("Add complete! Changed " + renamedCount + " asset name(s).");
    
    updatePreview();
}

// Apply Replace (Original functionality)
function applyRename() {
    var selectedAssets = api.getSelection();
    var findText = findInput.getText().trim();
    var replaceText = replaceInput.getText();
    
    if (selectedAssets.length === 0) {
        statusLabel.setText("❌ No assets selected!");
        statusLabel.setTextColor(T.error);
        console.warn("No items selected. Please select one or more items in the Assets panel.");
        return;
    }
    
    if (findText === "") {
        statusLabel.setText("❌ 'Find' field is empty!");
        statusLabel.setTextColor(T.error);
        console.warn("Please enter text in the 'Find' field.");
        return;
    }
    
    var renamedCount = 0;
    
    for (var i = 0; i < selectedAssets.length; i++) {
        var assetId = selectedAssets[i];
        var oldName = api.getNiceName(assetId);
        
        if (oldName.indexOf(findText) !== -1) {
            var newName = oldName.split(findText).join(replaceText);
            try {
                api.rename(assetId, newName);
                renamedCount++;
                console.log("Renamed: " + oldName + " → " + newName);
            } catch (e) {
                console.error("Failed to rename: " + oldName + " - " + e.message);
            }
        }
    }
    
    statusLabel.setText("✓ Renamed " + renamedCount + " asset(s)");
    statusLabel.setTextColor(T.accent);
    console.log("Replace complete! Changed " + renamedCount + " asset name(s).");
    
    updatePreview();
}

// Apply Numbering
function applyNumbering() {
    var selectedAssets = api.getSelection();
    var startStr = startNumberInput.getText().trim();
    if (startStr === "") startStr = "01";
    
    if (selectedAssets.length === 0) {
        statusLabel.setText("❌ No assets selected!");
        statusLabel.setTextColor(T.error);
        console.warn("No items selected. Please select one or more items in the Assets panel.");
        return;
    }
    
    var startNum = parseInt(startStr);
    if (isNaN(startNum)) {
        statusLabel.setText("❌ Invalid start number!");
        statusLabel.setTextColor(T.error);
        console.warn("Please enter a valid number in the 'Start numbering from' field.");
        return;
    }
    
    var padding = detectPadding(startStr);
    var position = positionDropdown.getText();
    var reverse = reverseCheckbox.getValue();
    
    // Create working array (potentially reversed)
    var workingAssets = selectedAssets.slice(); // Copy array
    if (reverse) {
        workingAssets.reverse();
    }
    
    var renamedCount = 0;
    
    for (var i = 0; i < workingAssets.length; i++) {
        var assetId = workingAssets[i];
        var oldName = api.getNiceName(assetId);
        var number = padNumber(startNum + i, padding);
        var newName;
        
        if (position === "Prepend") {
            newName = number + " " + oldName;
        } else {
            newName = oldName + " " + number;
        }
        
        try {
            api.rename(assetId, newName);
            renamedCount++;
            console.log("Renamed: " + oldName + " → " + newName);
        } catch (e) {
            console.error("Failed to rename: " + oldName + " - " + e.message);
        }
    }
    
    statusLabel.setText("✓ Numbered " + renamedCount + " asset(s)");
    statusLabel.setTextColor(T.accent);
    console.log("Numbering complete! Changed " + renamedCount + " asset name(s).");
    
    updatePreview();
}

// =============================================================================
// TAB LAYOUTS
// =============================================================================

function page(rows, applyButton) {
    var layout = new ui.VLayout();
    layout.setMargins(0, 0, 0, 0);
    layout.setSpaceBetween(6);
    rows.forEach(function (r) { layout.add(r); });
    layout.add(applyButton);
    var host = new ui.Container();
    host.setLayout(layout);
    return host;
}

var addPage = page([
    formRow("Prepend", field(prependInput, T), T),
    formRow("Append", field(appendInput, T), T)
], applyAddButton);

var replacePage = page([
    formRow("Find", field(findInput, T), T),
    formRow("Replace", field(replaceInput, T), T)
], applyReplaceButton);

var positionRow = new ui.HLayout();
positionRow.setSpaceBetween(8);
positionDropdown.setMinimumWidth(90);
positionRow.add(positionDropdown);
positionRow.add(checkRow(reverseCheckbox, "Reverse order", T));

var numberPage = page([
    formRow("Number from", field(startNumberInput, T), T, 80),
    formRow("Position", positionRow, T, 80)
], applyNumberButton);

// =============================================================================
// MAIN LAYOUT
// =============================================================================
var tabs = tabStrip(["Add", "Replace", "Number"], [addPage, replacePage, numberPage], T, function () {
    updatePreview();
});

var mainLayout = panel();
mainLayout.add(tabs.widget);
mainLayout.add(addPage);
mainLayout.add(replacePage);
mainLayout.add(numberPage);

var previewTitleLabel = label("Select items and change settings to preview", 11, T.muted);
mainLayout.add(previewTitleLabel);
mainLayout.add(preview.widget);
mainLayout.add(statusLabel);
mainLayout.addStretch();

// =============================================================================
// EVENT HANDLERS
// =============================================================================

// Add tab event handlers
prependInput.onValueChanged = function() { updatePreview(); };
appendInput.onValueChanged = function() { updatePreview(); };
applyAddButton.onClick = function() { applyAddText(); };

// Replace tab event handlers
findInput.onValueChanged = function() { updatePreview(); };
replaceInput.onValueChanged = function() { updatePreview(); };
applyReplaceButton.onClick = function() { applyRename(); };

// Number tab event handlers
startNumberInput.onValueChanged = function() { updatePreview(); };
positionDropdown.onValueChanged = function() { updatePreview(); };
reverseCheckbox.onValueChanged = function() { updatePreview(); };
applyNumberButton.onClick = function() { applyNumbering(); };

// =============================================================================
// INITIALIZE AND SHOW UI
// =============================================================================

ui.add(mainLayout);
ui.setMinimumWidth(300);
ui.setMinimumHeight(350);

// Initial preview update
updatePreview();

// Show the window
ui.show();


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
var scriptName = "Renamer";  // Must match key your repo's versions.json
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
