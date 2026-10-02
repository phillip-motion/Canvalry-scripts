// Find and Replace Text Plugin for Cavalry
// Searches through all text layers and composition overrides with regex and case sensitivity support

import { tokens, span, label, section, status, button, field, formRow, checkRow, list, row, panel } from "./lib/ui-kit.js";

var T = tokens();

ui.setTitle("Find and Replace Text");

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract plain text from Cavalry text value
 * Handles both string and richText object formats
 */
function extractPlainText(textValue) {
    if (!textValue) return "";
    
    // If it's wrapped in a value property
    if (typeof textValue === 'object' && textValue.value !== undefined) {
        return extractPlainText(textValue.value);
    }
    
    // If it's a richText object with text property
    if (typeof textValue === 'object' && textValue.text !== undefined) {
        return textValue.text;
    }
    
    // Otherwise treat as plain string
    return String(textValue);
}

/**
 * Get all text entries from a single composition
 * Returns array of: { compId, layerId, overrideIndex (or null), text, displayName }
 */
function getAllTextFromComp(compId) {
    var textEntries = [];
    
    try {
        // Set this comp as active
        api.setActiveComp(compId);
        var compName = api.getNiceName(compId);
        
        // Get all text shapes in this composition
        var textShapes = api.getCompLayersOfType(false, "textShape");
        
        for (var i = 0; i < textShapes.length; i++) {
            var layerId = textShapes[i];
            
            try {
                var textValue = api.get(layerId, "text");
                var plainText = extractPlainText(textValue);
                var layerName = api.getNiceName(layerId);
                
                textEntries.push({
                    compId: compId,
                    compName: compName,
                    layerId: layerId,
                    layerName: layerName,
                    overrideIndex: null,
                    text: plainText,
                    displayName: compName + " > " + layerName
                });
            } catch (e) {
                console.warn("Failed to get text from layer " + layerId + ": " + e);
            }
        }
        
        // Get all composition references in this composition
        var compRefs = api.getCompLayersOfType(false, "compositionReference");
        
        for (var j = 0; j < compRefs.length; j++) {
            var refLayerId = compRefs[j];
            var refLayerName = api.getNiceName(refLayerId);
            
            // Loop through override indices
            var overrideIndex = 0;
            var maxOverrides = 50; // Safety limit
            
            while (overrideIndex < maxOverrides) {
                // Check if this override index exists
                if (!api.hasAttribute(refLayerId, "overrides." + overrideIndex)) {
                    break;
                }
                
                // Check if this override has richText
                var richTextPath = "overrides." + overrideIndex + ".richText";
                if (api.hasAttribute(refLayerId, richTextPath)) {
                    var richTextValue = api.get(refLayerId, richTextPath);
                    if (richTextValue) {
                        var overrideText = extractPlainText(richTextValue);
                        if (overrideText) {
                            textEntries.push({
                                compId: compId,
                                compName: compName,
                                layerId: refLayerId,
                                layerName: refLayerName,
                                overrideIndex: overrideIndex,
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

/**
 * Get all text entries from all compositions
 */
function getAllTextFromProject() {
    var allEntries = [];
    var allComps = api.getComps();
    var originalActiveComp = api.getActiveComp();
    
    for (var i = 0; i < allComps.length; i++) {
        var compEntries = getAllTextFromComp(allComps[i]);
        allEntries = allEntries.concat(compEntries);
    }
    
    // Restore original active comp
    if (originalActiveComp) {
        api.setActiveComp(originalActiveComp);
    }
    
    return allEntries;
}

/**
 * Build search pattern based on options
 */
function buildSearchPattern(searchText, useRegex, caseSensitive) {
    if (!searchText) return null;
    
    try {
        var flags = caseSensitive ? "g" : "gi";
        
        if (useRegex) {
            return new RegExp(searchText, flags);
        } else {
            // Escape special regex characters for literal search
            var escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escaped, flags);
        }
    } catch (e) {
        console.error("Invalid regex pattern: " + e);
        return null;
    }
}

/**
 * Find matches in text entries
 */
function findMatches(textEntries, searchPattern) {
    var matches = [];
    
    for (var i = 0; i < textEntries.length; i++) {
        var entry = textEntries[i];
        
        // Reset lastIndex for global regex
        searchPattern.lastIndex = 0;
        
        if (searchPattern.test(entry.text)) {
            // Reset again to count matches
            searchPattern.lastIndex = 0;
            var matchCount = (entry.text.match(searchPattern) || []).length;
            
            matches.push({
                entry: entry,
                matchCount: matchCount
            });
        }
    }
    
    return matches;
}

/**
 * Replace text in a single entry
 */
function replaceTextInEntry(entry, searchPattern, replaceText) {
    try {
        var newText = entry.text.replace(searchPattern, replaceText);
        
        if (newText === entry.text) {
            return { success: true, changed: false };
        }
        
        // Set the comp as active
        api.setActiveComp(entry.compId);
        
        if (entry.overrideIndex === null) {
            // Update text shape directly
            api.set(entry.layerId, {"text": newText});
        } else {
            // Update composition reference override
            var overridePath = "overrides." + entry.overrideIndex + ".richText";
            
            // Create the richText value structure
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

// ============================================
// UI CONTROLS
// ============================================

// Find input
var findInput = new ui.LineEdit();
findInput.setPlaceholder("Search text or regex pattern...");

// Replace input
var replaceInput = new ui.LineEdit();
replaceInput.setPlaceholder("Replacement text...");

// Options checkboxes
var caseSensitiveCheckbox = new ui.Checkbox(false);
var useRegexCheckbox = new ui.Checkbox(false);

// Buttons
var findButton = button("Find All", false, T);
findButton.setToolTip("Search all text layers and overrides");

var replaceAllButton = button("Replace All", true, T);
replaceAllButton.setToolTip("Replace all matches across the project");

// Results display
var results = list(200, T);

// Status label
var statusLabel = status("Enter search text and click 'Find All'", T);

// Store current matches for replace operation
var currentMatches = [];
var currentSearchPattern = null;

// ============================================
// RESULTS TABLE FUNCTIONS
// ============================================

function clearResultsTable() {
    results.layout.clear();
}

/**
 * A snippet of the text around the first match, as rich text with every match
 * picked out in the accent.
 */
function highlightMatches(text, pattern) {
    pattern.lastIndex = 0;
    var first = text.search(pattern);
    var start = 0;
    var end = text.length;
    if (text.length > 80 && first !== -1) {
        start = Math.max(0, first - 20);
        end = Math.min(text.length, first + 60);
    }
    var snippet = text.substring(start, end);

    var html = start > 0 ? span("…", { color: T.muted }) : "";
    var last = 0;
    var m;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(snippet)) !== null) {
        if (m[0].length === 0) { pattern.lastIndex++; continue; }
        html += span(snippet.substring(last, m.index), { color: T.text });
        html += span(m[0], { color: T.accent, "font-weight": 600 });
        last = m.index + m[0].length;
    }
    html += span(snippet.substring(last), { color: T.text });
    if (end < text.length) html += span("…", { color: T.muted });
    pattern.lastIndex = 0;
    return html;
}

function populateResults(matches, pattern) {
    clearResultsTable();

    if (matches.length === 0) {
        results.layout.add(label("No matches found", 11, T.muted));
        results.layout.addStretch();
        return;
    }

    for (var i = 0; i < matches.length; i++) {
        var match = matches[i];
        var title = span(match.entry.displayName, { color: T.text, "font-weight": 500 }) +
            span("  " + match.matchCount + " match" + (match.matchCount > 1 ? "es" : ""), { color: T.muted, "font-size": "10px" });
        results.layout.add(row(title, null, T, { detailHtml: highlightMatches(match.entry.text, pattern), tip: match.entry.text }));
    }
    results.layout.addStretch();
}

// ============================================
// MAIN FUNCTIONS
// ============================================

function performFind() {
    var searchText = findInput.getText();
    
    if (!searchText || searchText.trim() === "") {
        statusLabel.setText("Please enter search text");
        statusLabel.setTextColor(T.error);
        clearResultsTable();
        currentMatches = [];
        currentSearchPattern = null;
        return;
    }
    
    var caseSensitive = caseSensitiveCheckbox.getValue();
    var useRegex = useRegexCheckbox.getValue();
    
    // Build search pattern
    var pattern = buildSearchPattern(searchText, useRegex, caseSensitive);
    
    if (!pattern) {
        statusLabel.setText("Invalid regex pattern");
        statusLabel.setTextColor(T.error);
        clearResultsTable();
        currentMatches = [];
        currentSearchPattern = null;
        return;
    }
    
    statusLabel.setText("Searching...");
    statusLabel.setTextColor(T.muted);
    
    // Get all text entries
    var allTextEntries = getAllTextFromProject();
    
    if (allTextEntries.length === 0) {
        statusLabel.setText("No text layers found in project");
        statusLabel.setTextColor(T.muted);
        clearResultsTable();
        currentMatches = [];
        currentSearchPattern = null;
        return;
    }
    
    // Find matches
    var matches = findMatches(allTextEntries, pattern);
    
    // Store for replace operation
    currentMatches = matches;
    currentSearchPattern = pattern;
    
    // Update UI
    populateResults(matches, pattern);
    
    // Count total matches
    var totalMatchCount = 0;
    for (var i = 0; i < matches.length; i++) {
        totalMatchCount += matches[i].matchCount;
    }
    
    if (matches.length === 0) {
        statusLabel.setText("No matches found (searched " + allTextEntries.length + " text entries)");
        statusLabel.setTextColor(T.muted);
    } else {
        statusLabel.setText("Found " + totalMatchCount + " match" + (totalMatchCount > 1 ? "es" : "") + " in " + matches.length + " text layer" + (matches.length > 1 ? "s" : ""));
        statusLabel.setTextColor(T.accent);
    }
}

function performReplaceAll() {
    var searchText = findInput.getText();
    var replaceText = replaceInput.getText();
    
    if (!searchText || searchText.trim() === "") {
        statusLabel.setText("Please enter search text");
        statusLabel.setTextColor(T.error);
        return;
    }
    
    // Re-run find to get fresh matches
    var caseSensitive = caseSensitiveCheckbox.getValue();
    var useRegex = useRegexCheckbox.getValue();
    
    var pattern = buildSearchPattern(searchText, useRegex, caseSensitive);
    
    if (!pattern) {
        statusLabel.setText("Invalid regex pattern");
        statusLabel.setTextColor(T.error);
        return;
    }
    
    statusLabel.setText("Replacing...");
    statusLabel.setTextColor(T.muted);
    
    // Get all text entries
    var allTextEntries = getAllTextFromProject();
    var matches = findMatches(allTextEntries, pattern);
    
    if (matches.length === 0) {
        statusLabel.setText("No matches found to replace");
        statusLabel.setTextColor(T.muted);
        return;
    }
    
    // Store original active comp
    var originalActiveComp = api.getActiveComp();
    
    // Perform replacements
    var successCount = 0;
    var failCount = 0;
    var totalReplacements = 0;
    
    for (var i = 0; i < matches.length; i++) {
        var match = matches[i];
        
        // Rebuild pattern for each replacement (to reset state)
        var replacePattern = buildSearchPattern(searchText, useRegex, caseSensitive);
        
        var result = replaceTextInEntry(match.entry, replacePattern, replaceText);
        
        if (result.success && result.changed) {
            successCount++;
            totalReplacements += match.matchCount;
        } else if (!result.success) {
            failCount++;
        }
    }
    
    // Restore original active comp
    if (originalActiveComp) {
        api.setActiveComp(originalActiveComp);
    }
    
    // Update status
    var statusMsg = "Replaced " + totalReplacements + " occurrence" + (totalReplacements > 1 ? "s" : "") + " in " + successCount + " text layer" + (successCount > 1 ? "s" : "");
    if (failCount > 0) {
        statusMsg += " (" + failCount + " failed)";
    }
    statusLabel.setText(statusMsg);
    statusLabel.setTextColor(T.accent);
    
    // Clear results since text has changed
    clearResultsTable();
    currentMatches = [];
    currentSearchPattern = null;
    
    console.log("Replace complete: " + statusMsg);
}

// ============================================
// UI LAYOUT
// ============================================

var mainLayout = panel();
mainLayout.add(formRow("Find", field(findInput, T), T, 55));
mainLayout.add(formRow("Replace", field(replaceInput, T), T, 55));

var optionsRow = new ui.HLayout();
optionsRow.setSpaceBetween(16);
optionsRow.add(checkRow(caseSensitiveCheckbox, "Case sensitive", T));
optionsRow.add(checkRow(useRegexCheckbox, "Use regex", T));
mainLayout.add(optionsRow);

var buttonsRow = new ui.HLayout();
buttonsRow.setSpaceBetween(6);
buttonsRow.add(findButton);
buttonsRow.add(replaceAllButton);
mainLayout.add(buttonsRow);

mainLayout.add(section("Results", T));
mainLayout.add(results.widget);
mainLayout.add(statusLabel);
mainLayout.addStretch();

// ============================================
// EVENT HANDLERS
// ============================================

findButton.onClick = function() {
    performFind();
};

replaceAllButton.onClick = function() {
    performReplaceAll();
};

// Allow Enter key to trigger find
findInput.onReturnPressed = function() {
    performFind();
};

// ============================================
// INITIALIZE
// ============================================

clearResultsTable();

ui.add(mainLayout);
ui.setMinimumWidth(350);
ui.setMinimumHeight(400);
ui.show();

console.log("Find and Replace Text plugin loaded");


// ============================================
// VERSION CHECK (Optional)
// ============================================

var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "Find and Replace Text";
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
                if (callback) callback(false);
                return;
            }
            
            if (latestVersion.startsWith('v')) {
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
            if (callback) callback(false);
        }
    } catch (e) {
        if (callback) callback(false);
    }
}

checkForUpdate(GITHUB_REPO, scriptName, currentVersion);
