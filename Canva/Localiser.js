// Cavalry Text Localizer Plugin
// Exports all text strings from the project to JSON and reimports edited translations

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
 * Returns: { layerId: text, layerId.overrideIndex: text, ... }
 */
function getAllTextFromComp(compId) {
    var textMap = {};
    
    try {
        // Set this comp as active
        api.setActiveComp(compId);
        
        // Get all text shapes in this composition
        var textShapes = api.getCompLayersOfType(false, "textShape");
        
        for (var i = 0; i < textShapes.length; i++) {
            var layerId = textShapes[i];
            
            try {
                var textValue = api.get(layerId, "text");
                var plainText = extractPlainText(textValue);
                textMap[layerId] = plainText;
            } catch (e) {
                console.warn("Failed to get text from layer " + layerId + ": " + e);
            }
        }
        
        // Get all composition references in this composition
        var compRefs = api.getCompLayersOfType(false, "compositionReference");
        
        for (var j = 0; j < compRefs.length; j++) {
            var refLayerId = compRefs[j];
            
            // Loop through override indices using hasAttribute to avoid console errors
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
                            var key = refLayerId + "." + overrideIndex;
                            textMap[key] = overrideText;
                        }
                    }
                }
                
                overrideIndex++;
            }
        }
        
    } catch (e) {
        console.error("Failed to process composition " + compId + ": " + e);
    }
    
    return textMap;
}

/**
 * Update a single text entry from imported JSON
 */
function updateTextEntry(compId, layerKey, text) {
    try {
        // Parse the layer key to check for override index
        var parts = layerKey.split('.');
        var layerId = parts[0];
        var overrideIndex = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : null;
        
        // Check if layer exists
        if (!api.layerExists(layerId)) {
            return { success: false, error: "Layer no longer exists: " + layerId };
        }
        
        // Set the comp as active
        api.setActiveComp(compId);
        
        if (overrideIndex === null) {
            // Update text shape
            api.set(layerId, {"text": text});
            return { success: true };
            
        } else {
            // Update composition reference override using scripting path
            var overridePath = "overrides." + overrideIndex + ".richText";
            
            // Create the richText value structure
            var richTextValue = {
                text: text,
                overrides: [{
                    start: 0,
                    end: text.length,
                    features: { calt: 1, clig: 1, liga: 1 }
                }]
            };
            
            // Set the override using the scripting path
            var setObj = {};
            setObj[overridePath] = richTextValue;
            api.set(layerId, setObj);
            
            return { success: true };
        }
        
    } catch (e) {
        return { success: false, error: "Failed to update: " + e.toString() };
    }
}

// ============================================
// EXPORT FUNCTION
// ============================================

function exportAllText() {
    try {
        // Get all compositions in the scene
        var allComps = api.getComps();
        
        // Store the current active comp to restore later
        var originalActiveComp = api.getActiveComp();
        
        // Build nested structure: { compId: { layerId: text } }
        var exportData = {};
        var totalTextCount = 0;
        
        for (var i = 0; i < allComps.length; i++) {
            var compId = allComps[i];
            var textMap = getAllTextFromComp(compId);
            
            // Count how many text entries in this comp
            var compTextCount = 0;
            for (var key in textMap) {
                if (textMap.hasOwnProperty(key)) {
                    compTextCount++;
                }
            }
            
            // Only add comp if it has text entries
            if (compTextCount > 0) {
                exportData[compId] = textMap;
                totalTextCount += compTextCount;
            }
        }
        
        // Restore original active comp
        if (originalActiveComp) {
            api.setActiveComp(originalActiveComp);
        }
        
        if (totalTextCount === 0) {
            statusLabel.setText("No text found in project");
            return false;
        }
        
        // Convert to formatted JSON string
        var jsonString = JSON.stringify(exportData, null, 2);
        
        // Present save dialog
        var startPath = api.getProjectPath() || api.getDesktopFolder();
        var filePath = api.presentSaveFile(
            startPath,
            "Export Text as JSON",
            "JSON File (*.json)",
            "cavalry_text_export.json"
        );
        
        if (!filePath || filePath === "") {
            statusLabel.setText("Export cancelled");
            return false;
        }
        
        // Write to file
        var writeSuccess = api.writeToFile(filePath, jsonString, true);
        
        if (writeSuccess) {
            statusLabel.setText("Exported " + totalTextCount + " text entries");
            return true;
        } else {
            statusLabel.setText("Export failed - could not write file");
            return false;
        }
        
    } catch (e) {
        statusLabel.setText("Export error: " + e.toString());
        return false;
    }
}

// ============================================
// IMPORT FUNCTION
// ============================================

function importAllText() {
    try {
        // Present file open dialog
        var startPath = api.getProjectPath() || api.getDesktopFolder();
        var filePath = api.presentOpenFile(
            startPath,
            "Import Text from JSON",
            "JSON File (*.json)"
        );
        
        if (!filePath || filePath === "") {
            statusLabel.setText("Import cancelled");
            return false;
        }
        
        // Read JSON file
        var jsonString = api.readFromFile(filePath);
        
        if (!jsonString) {
            statusLabel.setText("Failed to read file");
            return false;
        }
        
        // Parse JSON
        var importData;
        try {
            importData = JSON.parse(jsonString);
        } catch (parseError) {
            statusLabel.setText("Invalid JSON format");
            return false;
        }
        
        // Validate JSON structure
        if (typeof importData !== 'object' || importData === null) {
            statusLabel.setText("Invalid JSON structure");
            return false;
        }
        
        // Update each text entry
        var successCount = 0;
        var failCount = 0;
        
        // Iterate through compositions
        for (var compId in importData) {
            if (!importData.hasOwnProperty(compId)) continue;
            
            var compData = importData[compId];
            
            // Iterate through layers in this comp
            for (var layerKey in compData) {
                if (!compData.hasOwnProperty(layerKey)) continue;
                
                var text = compData[layerKey];
                var result = updateTextEntry(compId, layerKey, text);
                
                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                }
            }
        }
        
        var statusMsg = "Imported: " + successCount + " succeeded";
        if (failCount > 0) {
            statusMsg += ", " + failCount + " failed";
        }
        statusLabel.setText(statusMsg);
        
        return true;
        
    } catch (e) {
        statusLabel.setText("Import error: " + e.toString());
        return false;
    }
}

// ============================================
// UI CREATION
// ============================================

// Create main layout
var mainLayout = new ui.VLayout();
mainLayout.setMargins(10, 10, 10, 10);
mainLayout.setSpaceBetween(10);

// Export button
var exportButton = new ui.Button("Export Text to JSON");
exportButton.setMinimumHeight(36);
exportButton.setToolTip("Export all text from all compositions to a JSON file");
exportButton.onClick = function() {
    statusLabel.setText("Exporting...");
    exportAllText();
};
mainLayout.add(exportButton);

// Import button
var importButton = new ui.Button("Import Text from JSON");
importButton.setMinimumHeight(36);
importButton.setToolTip("Import text from a JSON file and update all text in the project");
importButton.onClick = function() {
    statusLabel.setText("Importing...");
    importAllText();
};
mainLayout.add(importButton);

// Status label
var statusLabel = new ui.Label("Ready");
statusLabel.setMinimumHeight(20);
statusLabel.setAlignment(1); // Center align
mainLayout.add(statusLabel);

// Add stretch to push everything to the top
mainLayout.addStretch();

// Set the layout and show
ui.add(mainLayout);
ui.setMargins(0, 0, 0, 0);
ui.setTitle("Localiser");
ui.show();

console.log("Text Localizer plugin loaded");
