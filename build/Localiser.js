// src/Localiser.js
function escapeCSV(value) {
  if (value === null || value === void 0) {
    return "";
  }
  var str = String(value);
  if (str.indexOf(",") !== -1 || str.indexOf("\n") !== -1 || str.indexOf("\r") !== -1 || str.indexOf('"') !== -1) {
    str = str.replace(/"/g, '""');
    return '"' + str + '"';
  }
  return str;
}
function parseCSV(csvString) {
  var result = { headers: [], rows: [] };
  if (!csvString || csvString.trim() === "") {
    return result;
  }
  var lines = [];
  var currentLine = "";
  var inQuotes = false;
  for (var i = 0; i < csvString.length; i++) {
    var char = csvString[i];
    if (char === '"') {
      if (inQuotes && i + 1 < csvString.length && csvString[i + 1] === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (currentLine.trim() !== "") {
        lines.push(currentLine);
      }
      currentLine = "";
      if (char === "\r" && i + 1 < csvString.length && csvString[i + 1] === "\n") {
        i++;
      }
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim() !== "") {
    lines.push(currentLine);
  }
  if (lines.length === 0) {
    return result;
  }
  result.headers = parseCSVRow(lines[0]);
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
function parseCSVRow(rowString) {
  var values = [];
  var currentValue = "";
  var inQuotes = false;
  for (var i = 0; i < rowString.length; i++) {
    var char = rowString[i];
    if (char === '"') {
      if (inQuotes && i + 1 < rowString.length && rowString[i + 1] === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(currentValue);
      currentValue = "";
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue);
  return values;
}
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
  if (originalActiveComp) {
    api.setActiveComp(originalActiveComp);
  }
  return flatData;
}
var csvImportData = null;
var detectedLanguages = [];
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
  var textMap = {};
  try {
    api.setActiveComp(compId);
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
    var compRefs = api.getCompLayersOfType(false, "compositionReference");
    for (var j = 0; j < compRefs.length; j++) {
      var refLayerId = compRefs[j];
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
function updateTextEntry(compId, layerKey, text) {
  try {
    var parts = layerKey.split(".");
    var layerId = parts[0];
    var overrideIndex = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : null;
    if (!api.layerExists(layerId)) {
      return { success: false, error: "Layer no longer exists: " + layerId };
    }
    api.setActiveComp(compId);
    if (overrideIndex === null) {
      api.set(layerId, { "text": text });
      return { success: true };
    } else {
      var overridePath = "overrides." + overrideIndex + ".richText";
      var richTextValue = {
        text,
        overrides: [{
          start: 0,
          end: text.length,
          features: { calt: 1, clig: 1, liga: 1 }
        }]
      };
      var setObj = {};
      setObj[overridePath] = richTextValue;
      api.set(layerId, setObj);
      return { success: true };
    }
  } catch (e) {
    return { success: false, error: "Failed to update: " + e.toString() };
  }
}
function exportAllText() {
  try {
    var allComps = api.getComps();
    var originalActiveComp = api.getActiveComp();
    var exportData = {};
    var totalTextCount = 0;
    for (var i = 0; i < allComps.length; i++) {
      var compId = allComps[i];
      var textMap = getAllTextFromComp(compId);
      var compTextCount = 0;
      for (var key in textMap) {
        if (textMap.hasOwnProperty(key)) {
          compTextCount++;
        }
      }
      if (compTextCount > 0) {
        exportData[compId] = textMap;
        totalTextCount += compTextCount;
      }
    }
    if (originalActiveComp) {
      api.setActiveComp(originalActiveComp);
    }
    if (totalTextCount === 0) {
      statusLabel.setText("No text found in project");
      return false;
    }
    var jsonString = JSON.stringify(exportData, null, 2);
    var scenePath = api.getSceneFilePath();
    var defaultName = "cavalry_text_export";
    if (scenePath && scenePath !== "") {
      defaultName = api.getFileNameFromPath(scenePath, false);
    }
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
function importAllText() {
  try {
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
    var jsonString = api.readFromFile(filePath);
    if (!jsonString) {
      statusLabel.setText("Failed to read file");
      return false;
    }
    var importData;
    try {
      importData = JSON.parse(jsonString);
    } catch (parseError) {
      statusLabel.setText("Invalid JSON format");
      return false;
    }
    if (typeof importData !== "object" || importData === null) {
      statusLabel.setText("Invalid JSON structure");
      return false;
    }
    var successCount = 0;
    var failCount = 0;
    for (var compId in importData) {
      if (!importData.hasOwnProperty(compId)) continue;
      var compData = importData[compId];
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
function exportToCSV() {
  try {
    var flatData = getAllTextAsFlat();
    if (flatData.length === 0) {
      statusLabel.setText("No text found in project");
      return false;
    }
    var csvLines = [];
    csvLines.push("compID,nodeID,originalValue");
    for (var i = 0; i < flatData.length; i++) {
      var row = flatData[i];
      var line = escapeCSV(row.compID) + "," + escapeCSV(row.nodeID) + "," + escapeCSV(row.originalValue);
      csvLines.push(line);
    }
    var csvString = csvLines.join("\n");
    var scenePath = api.getSceneFilePath();
    var defaultName = "cavalry_text_export";
    if (scenePath && scenePath !== "") {
      defaultName = api.getFileNameFromPath(scenePath, false);
    }
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
function loadCSVFile() {
  try {
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
    var csvString = api.readFromFile(filePath);
    if (!csvString) {
      statusLabel.setText("Failed to read file");
      return false;
    }
    csvImportData = parseCSV(csvString);
    if (csvImportData.rows.length === 0) {
      statusLabel.setText("No data found in CSV");
      csvImportData = null;
      return false;
    }
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
    languageDropdown.clear();
    for (var j = 0; j < detectedLanguages.length; j++) {
      languageDropdown.addEntry(detectedLanguages[j]);
    }
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
      if (!newText || newText.trim() === "") {
        newText = row[fallbackColumn];
        fallbackCount++;
      }
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
    for (var langIdx = 0; langIdx < detectedLanguages.length; langIdx++) {
      var lang = detectedLanguages[langIdx];
      var compDuplicateMap = {};
      for (var compIdx = 0; compIdx < compIds.length; compIdx++) {
        var origCompId = compIds[compIdx];
        if (!api.layerExists(origCompId)) {
          console.warn("Composition " + origCompId + " no longer exists");
          continue;
        }
        var origName = api.getNiceName(origCompId);
        var newName = origName + "_" + lang;
        var newCompId = api.duplicate(origCompId, true);
        if (newCompId) {
          api.rename(newCompId, newName);
          compDuplicateMap[origCompId] = newCompId;
          totalCreated++;
        }
      }
      var fallbackColumn = csvImportData.headers[2];
      for (var rowIdx = 0; rowIdx < csvImportData.rows.length; rowIdx++) {
        var row = csvImportData.rows[rowIdx];
        var origComp = row["compID"];
        var nodeId = row["nodeID"];
        var translation = row[lang];
        if (!translation || translation.trim() === "") {
          translation = row[fallbackColumn];
        }
        var targetCompId = compDuplicateMap[origComp];
        if (!targetCompId || !translation || translation.trim() === "") {
          continue;
        }
        applyTranslationToComp(targetCompId, origComp, nodeId, translation);
      }
    }
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
function applyTranslationToComp(newCompId, origCompId, origNodeId, translation) {
  try {
    api.setActiveComp(newCompId);
    var parts = origNodeId.split(".");
    var origLayerType = origNodeId.split("#")[0];
    var origLayerNum = parseInt(origNodeId.split("#")[1], 10);
    var overrideIndex = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : null;
    var layers;
    if (origLayerType === "textShape") {
      layers = api.getCompLayersOfType(false, "textShape");
    } else if (origLayerType === "compositionReference") {
      layers = api.getCompLayersOfType(false, "compositionReference");
    } else {
      return;
    }
    api.setActiveComp(origCompId);
    var origLayers;
    if (origLayerType === "textShape") {
      origLayers = api.getCompLayersOfType(false, "textShape");
    } else {
      origLayers = api.getCompLayersOfType(false, "compositionReference");
    }
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
    api.setActiveComp(newCompId);
    var newLayerId = layers[origIndex];
    if (overrideIndex === null) {
      api.set(newLayerId, { "text": translation });
    } else {
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
var mainLayout = new ui.VLayout();
mainLayout.setMargins(10, 10, 10, 10);
mainLayout.setSpaceBetween(8);
var jsonLabel = new ui.Label("JSON Export/Import");
jsonLabel.setToolTip("Simple JSON format for direct text editing");
mainLayout.add(jsonLabel);
var jsonButtonLayout = new ui.HLayout();
jsonButtonLayout.setSpaceBetween(6);
var exportButton = new ui.Button("Export JSON");
exportButton.setMinimumHeight(32);
exportButton.setToolTip("Export all text from all compositions to a JSON file");
exportButton.onClick = function() {
  statusLabel.setText("Exporting JSON...");
  exportAllText();
};
jsonButtonLayout.add(exportButton);
var importButton = new ui.Button("Import JSON");
importButton.setMinimumHeight(32);
importButton.setToolTip("Import text from a JSON file and update all text in the project");
importButton.onClick = function() {
  statusLabel.setText("Importing JSON...");
  importAllText();
};
jsonButtonLayout.add(importButton);
mainLayout.add(jsonButtonLayout);
var csvLabel = new ui.Label("CSV Multi-Language Export/Import");
csvLabel.setToolTip("CSV format supports multiple language columns");
mainLayout.add(csvLabel);
var csvButtonLayout = new ui.HLayout();
csvButtonLayout.setSpaceBetween(6);
var csvExportButton = new ui.Button("Export CSV...");
csvExportButton.setMinimumHeight(32);
csvExportButton.setToolTip("Export text as CSV with headers: compID, nodeID, originalValue\nAdd language columns (e.g. French, Spanish) and fill in translations");
csvExportButton.onClick = function() {
  statusLabel.setText("Exporting CSV...");
  exportToCSV();
};
csvButtonLayout.add(csvExportButton);
var csvImportButton = new ui.Button("Load CSV...");
csvImportButton.setMinimumHeight(32);
csvImportButton.setToolTip("Load a CSV file with translations to select which language to import");
csvImportButton.onClick = function() {
  statusLabel.setText("Loading CSV...");
  loadCSVFile();
};
csvButtonLayout.add(csvImportButton);
mainLayout.add(csvButtonLayout);
var csvImportLayout = new ui.VLayout();
csvImportLayout.setSpaceBetween(6);
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
duplicateButton.setHidden(true);
languageDropdown.setHidden(true);
applyLangButton.setHidden(true);
mainLayout.addStretch();
var statusLabel = new ui.Label("Ready");
statusLabel.setMinimumHeight(20);
statusLabel.setAlignment(1);
mainLayout.add(statusLabel);
ui.add(mainLayout);
ui.setMargins(0, 0, 0, 0);
ui.setTitle("Localiser");
ui.show();
console.log("Text Localizer plugin loaded with CSV support");
