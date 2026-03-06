// Cavalry Text Localizer Plugin
// Exports all text strings from the project to JSON/CSV and reimports edited translations
// Supports multi-language CSV import with composition duplication

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Escape a value for CSV output
 * Wraps in quotes if contains comma, newline, or quotes
 * Doubles any existing quotes
 */
function escapeCSV(value) {
    if (value === null || value === undefined) {
        return "";
    }
    var str = String(value);
    // If contains comma, newline, carriage return, or quotes, wrap in quotes
    if (str.indexOf(",") !== -1 || str.indexOf("\n") !== -1 || str.indexOf("\r") !== -1 || str.indexOf('"') !== -1) {
        // Double any existing quotes
        str = str.replace(/"/g, '""');
        return '"' + str + '"';
    }
    return str;
}

/**
 * Parse a CSV string into an array of row objects
 * Returns: { headers: [string], rows: [{header: value, ...}] }
 */
function parseCSV(csvString) {
    var result = { headers: [], rows: [] };
    
    if (!csvString || csvString.trim() === "") {
        return result;
    }
    
    var lines = [];
    var currentLine = "";
    var inQuotes = false;
    
    // Split by lines, respecting quoted fields with newlines
    for (var i = 0; i < csvString.length; i++) {
        var char = csvString[i];
        
        if (char === '"') {
            // Check for escaped quote
            if (inQuotes && i + 1 < csvString.length && csvString[i + 1] === '"') {
                currentLine += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
                currentLine += char;
            }
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            // End of line (outside quotes)
            if (currentLine.trim() !== "") {
                lines.push(currentLine);
            }
            currentLine = "";
            // Skip \r\n combination
            if (char === '\r' && i + 1 < csvString.length && csvString[i + 1] === '\n') {
                i++;
            }
        } else {
            currentLine += char;
        }
    }
    // Don't forget the last line
    if (currentLine.trim() !== "") {
        lines.push(currentLine);
    }
    
    if (lines.length === 0) {
        return result;
    }
    
    // Parse header row
    result.headers = parseCSVRow(lines[0]);
    
    // Parse data rows
    for (var j = 1; j < lines.length; j++) {
        var values = parseCSVRow(lines[j]);
        var rowObj = {};
        for (var k = 0; k < result.headers.length; k++) {
            rowObj[result.headers[k]] = values[k] || "";
        }
        result.rows.push(rowObj);
    }
    
    return result;
}

/**
 * Parse a single CSV row into an array of values
 */
function parseCSVRow(rowString) {
    var values = [];
    var currentValue = "";
    var inQuotes = false;
    
    for (var i = 0; i < rowString.length; i++) {
        var char = rowString[i];
        
        if (char === '"') {
            if (inQuotes && i + 1 < rowString.length && rowString[i + 1] === '"') {
                // Escaped quote
                currentValue += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(currentValue);
            currentValue = "";
        } else {
            currentValue += char;
        }
    }
    values.push(currentValue);
    
    return values;
}

/**
 * Get all text data as flat array for CSV export
 * Returns: [{ compID: string, nodeID: string, originalValue: string }, ...]
 */
function getAllTextAsFlat() {
    var allComps = api.getComps();
    var originalActiveComp = api.getActiveComp();
    var flatData = [];
    
    for (var i = 0; i < allComps.length; i++) {
        var compId = allComps[i];
        var textMap = getAllTextFromComp(compId);
        
        for (var layerKey in textMap) {
            if (textMap.hasOwnProperty(layerKey)) {
                flatData.push({
                    compID: compId,
                    nodeID: layerKey,
                    originalValue: textMap[layerKey]
                });
            }
        }
    }
    
    // Restore original active comp
    if (originalActiveComp) {
        api.setActiveComp(originalActiveComp);
    }
    
    return flatData;
}

// Store for CSV import data (used between file selection and apply)
var csvImportData = null;
var detectedLanguages = [];

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
        
        // Get scene filename for default export name
        var scenePath = api.getSceneFilePath();
        var defaultName = "cavalry_text_export";
        if (scenePath && scenePath !== "") {
            defaultName = api.getFileNameFromPath(scenePath, false);
        }
        
        // Present save dialog
        var startPath = api.getProjectPath() || api.getDesktopFolder();
        var filePath = api.presentSaveFile(
            startPath,
            "Export Text as JSON",
            "JSON File (*.json)",
            defaultName + ".json"
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
// CSV EXPORT FUNCTION
// ============================================

function exportToCSV() {
    try {
        var flatData = getAllTextAsFlat();
        
        if (flatData.length === 0) {
            statusLabel.setText("No text found in project");
            return false;
        }
        
        // Build CSV string with headers
        var csvLines = [];
        csvLines.push("compID,nodeID,originalValue");
        
        for (var i = 0; i < flatData.length; i++) {
            var row = flatData[i];
            var line = escapeCSV(row.compID) + "," + 
                       escapeCSV(row.nodeID) + "," + 
                       escapeCSV(row.originalValue);
            csvLines.push(line);
        }
        
        var csvString = csvLines.join("\n");
        
        // Get scene filename for default export name
        var scenePath = api.getSceneFilePath();
        var defaultName = "cavalry_text_export";
        if (scenePath && scenePath !== "") {
            defaultName = api.getFileNameFromPath(scenePath, false);
        }
        
        // Present save dialog
        var startPath = api.getProjectPath() || api.getDesktopFolder();
        var filePath = api.presentSaveFile(
            startPath,
            "Export Text as CSV",
            "CSV File (*.csv)",
            defaultName + ".csv"
        );
        
        if (!filePath || filePath === "") {
            statusLabel.setText("Export cancelled");
            return false;
        }
        
        // Write to file
        var writeSuccess = api.writeToFile(filePath, csvString, true);
        
        if (writeSuccess) {
            statusLabel.setText("Exported " + flatData.length + " text entries to CSV");
            return true;
        } else {
            statusLabel.setText("Export failed - could not write file");
            return false;
        }
        
    } catch (e) {
        statusLabel.setText("CSV Export error: " + e.toString());
        return false;
    }
}

// ============================================
// CSV IMPORT FUNCTIONS
// ============================================

/**
 * Load CSV file and detect language columns
 * Stores data in csvImportData for later application
 */
function loadCSVFile() {
    try {
        // Present file open dialog
        var startPath = api.getProjectPath() || api.getDesktopFolder();
        var filePath = api.presentOpenFile(
            startPath,
            "Import Text from CSV",
            "CSV File (*.csv)"
        );
        
        if (!filePath || filePath === "") {
            statusLabel.setText("Import cancelled");
            return false;
        }
        
        // Read CSV file
        var csvString = api.readFromFile(filePath);
        
        if (!csvString) {
            statusLabel.setText("Failed to read file");
            return false;
        }
        
        // Parse CSV
        csvImportData = parseCSV(csvString);
        
        if (csvImportData.rows.length === 0) {
            statusLabel.setText("No data found in CSV");
            csvImportData = null;
            return false;
        }
        
        // Detect language columns (all columns beyond compID and nodeID)
        // The 3rd column can be "originalValue" or a renamed language code like "EN"
        var baseColumns = ["compID", "nodeID"];
        detectedLanguages = [];
        
        for (var i = 0; i < csvImportData.headers.length; i++) {
            var header = csvImportData.headers[i];
            if (baseColumns.indexOf(header) === -1) {
                detectedLanguages.push(header);
            }
        }
        
        if (detectedLanguages.length === 0) {
            statusLabel.setText("No language columns found. Need at least 3 columns.");
            return false;
        }
        
        // Populate language dropdown with all detected languages
        languageDropdown.clear();
        for (var j = 0; j < detectedLanguages.length; j++) {
            languageDropdown.addEntry(detectedLanguages[j]);
        }
        
        // Show the import controls
        languageDropdown.setHidden(false);
        applyLangButton.setHidden(false);
        duplicateButton.setHidden(false);
        statusLabel.setText("Found " + detectedLanguages.length + " language(s): " + detectedLanguages.join(", "));
        
        return true;
        
    } catch (e) {
        statusLabel.setText("CSV Load error: " + e.toString());
        csvImportData = null;
        return false;
    }
}

/**
 * Apply the selected language from CSV to the project
 */
function applySelectedLanguage() {
    if (!csvImportData || csvImportData.rows.length === 0) {
        statusLabel.setText("No CSV data loaded");
        return false;
    }
    
    var selectedLang = languageDropdown.getText();
    
    if (!selectedLang || detectedLanguages.indexOf(selectedLang) === -1) {
        statusLabel.setText("Please select a language");
        return false;
    }
    
    // Get the 3rd column name for fallback (could be "originalValue" or a language code)
    var fallbackColumn = csvImportData.headers[2];
    
    try {
        var successCount = 0;
        var failCount = 0;
        var fallbackCount = 0;
        
        for (var i = 0; i < csvImportData.rows.length; i++) {
            var row = csvImportData.rows[i];
            var compId = row["compID"];
            var nodeId = row["nodeID"];
            var newText = row[selectedLang];
            
            // Fallback to 3rd column value if translation is empty
            if (!newText || newText.trim() === "") {
                newText = row[fallbackColumn];
                fallbackCount++;
            }
            
            // Skip if still empty after fallback
            if (!newText || newText.trim() === "") {
                continue;
            }
            
            var result = updateTextEntry(compId, nodeId, newText);
            
            if (result.success) {
                successCount++;
            } else {
                failCount++;
            }
        }
        
        var statusMsg = "Applied " + selectedLang + ": " + successCount + " updated";
        if (fallbackCount > 0) {
            statusMsg += " (" + fallbackCount + " used fallback)";
        }
        if (failCount > 0) {
            statusMsg += ", " + failCount + " failed";
        }
        statusLabel.setText(statusMsg);
        
        return true;
        
    } catch (e) {
        statusLabel.setText("Apply error: " + e.toString());
        return false;
    }
}

// ============================================
// DUPLICATE COMPOSITIONS FOR ALL LANGUAGES
// ============================================

/**
 * Duplicate all compositions for each language in the CSV
 * Creates new comps with language suffix and applies translations
 */
function duplicateForAllLanguages() {
    if (!csvImportData || csvImportData.rows.length === 0) {
        statusLabel.setText("Load a CSV file first");
        return false;
    }
    
    if (detectedLanguages.length === 0) {
        statusLabel.setText("No languages found in CSV");
        return false;
    }
    
    try {
        var originalActiveComp = api.getActiveComp();
        
        // Get unique composition IDs from CSV
        var compIds = [];
        var compIdMap = {};
        for (var i = 0; i < csvImportData.rows.length; i++) {
            var compId = csvImportData.rows[i]["compID"];
            if (!compIdMap[compId]) {
                compIdMap[compId] = true;
                compIds.push(compId);
            }
        }
        
        var totalCreated = 0;
        
        // For each language
        for (var langIdx = 0; langIdx < detectedLanguages.length; langIdx++) {
            var lang = detectedLanguages[langIdx];
            
            // Map from original comp ID to new comp ID for this language
            var compDuplicateMap = {};
            
            // Duplicate each composition
            for (var compIdx = 0; compIdx < compIds.length; compIdx++) {
                var origCompId = compIds[compIdx];
                
                // Check if comp still exists
                if (!api.layerExists(origCompId)) {
                    console.warn("Composition " + origCompId + " no longer exists");
                    continue;
                }
                
                // Get original comp name
                var origName = api.getNiceName(origCompId);
                var newName = origName + "_" + lang;
                
                // Duplicate the composition
                var newCompId = api.duplicate(origCompId, true);
                
                if (newCompId) {
                    // Rename the duplicated comp
                    api.rename(newCompId, newName);
                    compDuplicateMap[origCompId] = newCompId;
                    totalCreated++;
                }
            }
            
            // Get the 3rd column name for fallback
            var fallbackColumn = csvImportData.headers[2];
            
            // Apply translations to duplicated compositions
            for (var rowIdx = 0; rowIdx < csvImportData.rows.length; rowIdx++) {
                var row = csvImportData.rows[rowIdx];
                var origComp = row["compID"];
                var nodeId = row["nodeID"];
                var translation = row[lang];
                
                // Fallback to 3rd column value if translation is empty
                if (!translation || translation.trim() === "") {
                    translation = row[fallbackColumn];
                }
                
                // Get the duplicated comp ID
                var targetCompId = compDuplicateMap[origComp];
                
                // Skip if still empty after fallback
                if (!targetCompId || !translation || translation.trim() === "") {
                    continue;
                }
                
                // The node IDs in the duplicated comp will have new IDs
                // We need to find the corresponding node in the new comp
                // Since duplicate() preserves structure, we need to map the old node to new
                // This is tricky - the nodeID format is like "textShape#1" or "compositionReference#2.0"
                
                // For now, let's try to apply directly - if the structure is preserved
                // the layer names should match, but IDs will differ
                // This requires a more sophisticated approach
                
                // Alternative: Apply to the duplicated comp by finding matching text
                applyTranslationToComp(targetCompId, origComp, nodeId, translation);
            }
        }
        
        // Restore original active comp
        if (originalActiveComp) {
            api.setActiveComp(originalActiveComp);
        }
        
        statusLabel.setText("Created " + totalCreated + " localized compositions");
        return true;
        
    } catch (e) {
        statusLabel.setText("Duplicate error: " + e.toString());
        return false;
    }
}

/**
 * Apply translation to a duplicated composition
 * Maps from original node structure to new node structure
 */
function applyTranslationToComp(newCompId, origCompId, origNodeId, translation) {
    try {
        api.setActiveComp(newCompId);
        
        // Parse the original node ID
        var parts = origNodeId.split('.');
        var origLayerType = origNodeId.split('#')[0];
        var origLayerNum = parseInt(origNodeId.split('#')[1], 10);
        var overrideIndex = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : null;
        
        // Get all layers of this type in the new comp
        var layers;
        if (origLayerType === "textShape") {
            layers = api.getCompLayersOfType(false, "textShape");
        } else if (origLayerType === "compositionReference") {
            layers = api.getCompLayersOfType(false, "compositionReference");
        } else {
            return;
        }
        
        // Find matching layer by position/index
        // Since duplicate preserves order, we find the nth layer of this type
        api.setActiveComp(origCompId);
        var origLayers;
        if (origLayerType === "textShape") {
            origLayers = api.getCompLayersOfType(false, "textShape");
        } else {
            origLayers = api.getCompLayersOfType(false, "compositionReference");
        }
        
        // Find the index of the original layer in the original comp
        var origIndex = -1;
        var baseLayerId = parts[0];
        for (var i = 0; i < origLayers.length; i++) {
            if (origLayers[i] === baseLayerId) {
                origIndex = i;
                break;
            }
        }
        
        if (origIndex === -1 || origIndex >= layers.length) {
            return;
        }
        
        // Get the corresponding layer in the new comp
        api.setActiveComp(newCompId);
        var newLayerId = layers[origIndex];
        
        // Apply the translation
        if (overrideIndex === null) {
            // Text shape
            api.set(newLayerId, {"text": translation});
        } else {
            // Composition reference override
            var overridePath = "overrides." + overrideIndex + ".richText";
            var richTextValue = {
                text: translation,
                overrides: [{
                    start: 0,
                    end: translation.length,
                    features: { calt: 1, clig: 1, liga: 1 }
                }]
            };
            var setObj = {};
            setObj[overridePath] = richTextValue;
            api.set(newLayerId, setObj);
        }
        
    } catch (e) {
        console.warn("Failed to apply translation to " + newCompId + ": " + e);
    }
}

// ============================================
// UI CREATION
// ============================================

// Create main layout
var mainLayout = new ui.VLayout();
mainLayout.setMargins(10, 10, 10, 10);
mainLayout.setSpaceBetween(8);

// ---- JSON Section ----
var jsonLabel = new ui.Label("JSON Export/Import");
jsonLabel.setToolTip("Simple JSON format for direct text editing");
mainLayout.add(jsonLabel);

// JSON button layout
var jsonButtonLayout = new ui.HLayout();
jsonButtonLayout.setSpaceBetween(6);

// Export JSON button
var exportButton = new ui.Button("Export JSON");
exportButton.setMinimumHeight(32);
exportButton.setToolTip("Export all text from all compositions to a JSON file");
exportButton.onClick = function() {
    statusLabel.setText("Exporting JSON...");
    exportAllText();
};
jsonButtonLayout.add(exportButton);

// Import JSON button
var importButton = new ui.Button("Import JSON");
importButton.setMinimumHeight(32);
importButton.setToolTip("Import text from a JSON file and update all text in the project");
importButton.onClick = function() {
    statusLabel.setText("Importing JSON...");
    importAllText();
};
jsonButtonLayout.add(importButton);

mainLayout.add(jsonButtonLayout);



// ---- CSV Section ----
var csvLabel = new ui.Label("CSV Multi-Language Export/Import");
csvLabel.setToolTip("CSV format supports multiple language columns");
mainLayout.add(csvLabel);

var csvButtonLayout = new ui.HLayout();
csvButtonLayout.setSpaceBetween(6);


// CSV Export button
var csvExportButton = new ui.Button("Export CSV...");
csvExportButton.setMinimumHeight(32);
csvExportButton.setToolTip("Export text as CSV with headers: compID, nodeID, originalValue\nAdd language columns (e.g. French, Spanish) and fill in translations");
csvExportButton.onClick = function() {
    statusLabel.setText("Exporting CSV...");
    exportToCSV();
};
csvButtonLayout.add(csvExportButton);

// CSV Import button (loads file and shows language selection)
var csvImportButton = new ui.Button("Load CSV...");
csvImportButton.setMinimumHeight(32);
csvImportButton.setToolTip("Load a CSV file with translations to select which language to import");
csvImportButton.onClick = function() {
    statusLabel.setText("Loading CSV...");
    loadCSVFile();
};
csvButtonLayout.add(csvImportButton);

mainLayout.add(csvButtonLayout);


// CSV Import controls (initially hidden)
var csvImportLayout = new ui.VLayout();
csvImportLayout.setSpaceBetween(6);

// Language selection row
var langSelectLayout = new ui.HLayout();
langSelectLayout.setSpaceBetween(6);

var duplicateButton = new ui.Button("Duplicate Comps for All Languages");
duplicateButton.setMinimumHeight(36);
duplicateButton.setToolTip("Load a CSV first, then click to create a copy of each composition for every language column.\nEach copy will have the language suffix appended and translations applied.");
duplicateButton.onClick = function() {
    if (!csvImportData) {
        statusLabel.setText("Load a CSV file first");
        return;
    }
    statusLabel.setText("Duplicating compositions...");
    duplicateForAllLanguages();
};
mainLayout.add(duplicateButton);


var languageDropdown = new ui.DropDown();
languageDropdown.setMinimumWidth(120);
langSelectLayout.add(languageDropdown);

// Apply button
var applyLangButton = new ui.Button("Apply");
applyLangButton.setMinimumHeight(28);
applyLangButton.setToolTip("Apply the selected language translations to the current project");
applyLangButton.onClick = function() {
    statusLabel.setText("Applying translations...");
    applySelectedLanguage();
};
langSelectLayout.add(applyLangButton);

csvImportLayout.add(langSelectLayout);
mainLayout.add(csvImportLayout);

// Hide the CSV import controls initially
duplicateButton.setHidden(true);
languageDropdown.setHidden(true);
applyLangButton.setHidden(true);


// ---- Status ----
mainLayout.addStretch();

// Status label
var statusLabel = new ui.Label("Ready");
statusLabel.setMinimumHeight(20);
statusLabel.setAlignment(1); // Center align
mainLayout.add(statusLabel);

// Set the layout and show
ui.add(mainLayout);
ui.setMargins(0, 0, 0, 0);
ui.setTitle("Localiser");
ui.show();

console.log("Text Localizer plugin loaded with CSV support");
