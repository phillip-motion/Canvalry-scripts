// src/Renamer.js
ui.setTitle("Renamer");
var prependInput = new ui.LineEdit();
prependInput.setPlaceholder("Prepend text...");
var appendInput = new ui.LineEdit();
appendInput.setPlaceholder("Append text...");
var applyAddButton = new ui.Button("Apply");
var findInput = new ui.LineEdit();
findInput.setPlaceholder("Text to find...");
var replaceInput = new ui.LineEdit();
replaceInput.setPlaceholder("Replacement text...");
var applyReplaceButton = new ui.Button("Apply");
var startNumberInput = new ui.LineEdit();
startNumberInput.setPlaceholder("01");
startNumberInput.setText("01");
var positionDropdown = new ui.DropDown();
positionDropdown.addEntry("Append");
positionDropdown.addEntry("Prepend");
var reverseCheckbox = new ui.Checkbox(false);
var applyNumberButton = new ui.Button("Apply");
var previewScrollView = new ui.ScrollView();
previewScrollView.setFixedHeight(200);
var originalNamesColumn;
var arrowsColumn;
var newNamesColumn;
var tableContainer;
var statusLabel = new ui.Label("");
statusLabel.setTextColor(ui.getThemeColor("Accent1"));
function clearPreviewTable() {
  originalNamesColumn = new ui.VLayout();
  originalNamesColumn.setSpaceBetween(2);
  arrowsColumn = new ui.VLayout();
  arrowsColumn.setSpaceBetween(2);
  newNamesColumn = new ui.VLayout();
  newNamesColumn.setSpaceBetween(2);
  tableContainer = new ui.HLayout();
  tableContainer.setSpaceBetween(0);
  tableContainer.add(originalNamesColumn);
  tableContainer.add(arrowsColumn);
  tableContainer.add(newNamesColumn);
  previewScrollView.setLayout(tableContainer);
}
function detectPadding(startStr) {
  var num = parseInt(startStr);
  if (isNaN(num)) return 2;
  if (startStr === num.toString()) return 0;
  return startStr.length;
}
function padNumber(num, padding) {
  if (padding === 0) return num.toString();
  var str = num.toString();
  while (str.length < padding) {
    str = "0" + str;
  }
  return str;
}
function updatePreview() {
  var selectedAssets = api.getSelection();
  var currentTab = tabView.currentTab();
  clearPreviewTable();
  if (selectedAssets.length === 0) {
    previewTitleLabel.setText("Select items and change settings to preview");
    previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
    return;
  }
  var changesCount = 0;
  var changesList = [];
  if (currentTab === 0) {
    var prependText = prependInput.getText();
    var appendText = appendInput.getText();
    if (prependText === "" && appendText === "") {
      previewTitleLabel.setText("Enter text in Prepend and/or Append fields to see preview.");
      previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
      return;
    }
    for (var i = 0; i < selectedAssets.length; i++) {
      var assetId = selectedAssets[i];
      var oldName = api.getNiceName(assetId);
      var newName = prependText + oldName + appendText;
      if (newName !== oldName) {
        changesList.push({ oldName, newName });
        changesCount++;
      }
    }
    if (changesCount === 0) {
      var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - No changes to apply";
      previewTitleLabel.setText(countText);
      previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
    } else {
      var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - " + changesCount + " will be modified";
      previewTitleLabel.setText(countText);
      previewTitleLabel.setTextColor("#ffffff");
    }
  } else if (currentTab === 1) {
    var findText = findInput.getText().trim();
    var replaceText = replaceInput.getText();
    if (findText === "") {
      previewTitleLabel.setText("Enter text in the 'Find' field to see preview.");
      previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
      return;
    }
    for (var i = 0; i < selectedAssets.length; i++) {
      var assetId = selectedAssets[i];
      var oldName = api.getNiceName(assetId);
      if (oldName.indexOf(findText) !== -1) {
        var newName = oldName.split(findText).join(replaceText);
        changesList.push({ oldName, newName });
        changesCount++;
      }
    }
    if (changesCount === 0) {
      var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - No matches found";
      previewTitleLabel.setText(countText);
      previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
    } else {
      var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - " + changesCount + " match(es) found";
      previewTitleLabel.setText(countText);
      previewTitleLabel.setTextColor("#ffffff");
    }
  } else if (currentTab === 2) {
    var startStr = startNumberInput.getText().trim();
    if (startStr === "") startStr = "01";
    var startNum = parseInt(startStr);
    if (isNaN(startNum)) {
      previewTitleLabel.setText("Please enter a valid number.");
      previewTitleLabel.setTextColor("#ff6666");
      return;
    }
    var padding = detectPadding(startStr);
    var position = positionDropdown.getText();
    var reverse = reverseCheckbox.getValue();
    var workingAssets = selectedAssets.slice();
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
      changesList.push({ oldName, newName });
      changesCount++;
    }
    if (changesCount > 0) {
      var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - " + changesCount + " will be numbered";
      previewTitleLabel.setText(countText);
      previewTitleLabel.setTextColor("#ffffff");
    }
  }
  for (var i = 0; i < changesList.length; i++) {
    var oldNameLabel = new ui.Label(changesList[i].oldName);
    oldNameLabel.setTextColor(ui.getThemeColor("Text"));
    originalNamesColumn.add(oldNameLabel);
    var arrowLabel = new ui.Label("\u2192");
    arrowLabel.setTextColor(ui.getThemeColor("Midlight"));
    arrowLabel.setAlignment(1);
    arrowLabel.setFixedWidth(12);
    arrowsColumn.add(arrowLabel);
    var newNameLabel = new ui.Label(changesList[i].newName);
    newNameLabel.setTextColor(ui.getThemeColor("Accent1"));
    newNamesColumn.add(newNameLabel);
  }
}
function applyAddText() {
  var selectedAssets = api.getSelection();
  var prependText = prependInput.getText();
  var appendText = appendInput.getText();
  if (selectedAssets.length === 0) {
    statusLabel.setText("\u274C No assets selected!");
    statusLabel.setTextColor("#ff6666");
    console.warn("No items selected. Please select one or more items in the Assets panel.");
    return;
  }
  if (prependText === "" && appendText === "") {
    statusLabel.setText("\u274C Enter text to prepend and/or append!");
    statusLabel.setTextColor("#ff6666");
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
        console.log("Renamed: " + oldName + " \u2192 " + newName);
      } catch (e) {
        console.error("Failed to rename: " + oldName + " - " + e.message);
      }
    }
  }
  statusLabel.setText("\u2713 Renamed " + renamedCount + " asset(s)");
  statusLabel.setTextColor(ui.getThemeColor("Accent1"));
  console.log("Add complete! Changed " + renamedCount + " asset name(s).");
  updatePreview();
}
function applyRename() {
  var selectedAssets = api.getSelection();
  var findText = findInput.getText().trim();
  var replaceText = replaceInput.getText();
  if (selectedAssets.length === 0) {
    statusLabel.setText("\u274C No assets selected!");
    statusLabel.setTextColor("#ff6666");
    console.warn("No items selected. Please select one or more items in the Assets panel.");
    return;
  }
  if (findText === "") {
    statusLabel.setText("\u274C 'Find' field is empty!");
    statusLabel.setTextColor("#ff6666");
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
        console.log("Renamed: " + oldName + " \u2192 " + newName);
      } catch (e) {
        console.error("Failed to rename: " + oldName + " - " + e.message);
      }
    }
  }
  statusLabel.setText("\u2713 Renamed " + renamedCount + " asset(s)");
  statusLabel.setTextColor(ui.getThemeColor("Accent1"));
  console.log("Replace complete! Changed " + renamedCount + " asset name(s).");
  updatePreview();
}
function applyNumbering() {
  var selectedAssets = api.getSelection();
  var startStr = startNumberInput.getText().trim();
  if (startStr === "") startStr = "01";
  if (selectedAssets.length === 0) {
    statusLabel.setText("\u274C No assets selected!");
    statusLabel.setTextColor("#ff6666");
    console.warn("No items selected. Please select one or more items in the Assets panel.");
    return;
  }
  var startNum = parseInt(startStr);
  if (isNaN(startNum)) {
    statusLabel.setText("\u274C Invalid start number!");
    statusLabel.setTextColor("#ff6666");
    console.warn("Please enter a valid number in the 'Start numbering from' field.");
    return;
  }
  var padding = detectPadding(startStr);
  var position = positionDropdown.getText();
  var reverse = reverseCheckbox.getValue();
  var workingAssets = selectedAssets.slice();
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
      console.log("Renamed: " + oldName + " \u2192 " + newName);
    } catch (e) {
      console.error("Failed to rename: " + oldName + " - " + e.message);
    }
  }
  statusLabel.setText("\u2713 Numbered " + renamedCount + " asset(s)");
  statusLabel.setTextColor(ui.getThemeColor("Accent1"));
  console.log("Numbering complete! Changed " + renamedCount + " asset name(s).");
  updatePreview();
}
var layoutMargin = 2;
var layoutSpaceBetween = 4;
var addTabLayout = new ui.VLayout();
addTabLayout.setMargins(layoutMargin, layoutMargin, layoutMargin, layoutMargin);
addTabLayout.setSpaceBetween(layoutSpaceBetween);
var prependLabel = new ui.Label("Prepend");
prependLabel.setTextColor(ui.getThemeColor("Light"));
prependLabel.setMinimumWidth(55);
var prependLayout = new ui.HLayout();
prependLayout.add(prependLabel);
prependLayout.add(prependInput);
addTabLayout.add(prependLayout);
var appendLabel = new ui.Label("Append");
appendLabel.setTextColor(ui.getThemeColor("Light"));
appendLabel.setMinimumWidth(55);
var appendLayout = new ui.HLayout();
appendLayout.add(appendLabel);
appendLayout.add(appendInput);
addTabLayout.add(appendLayout);
addTabLayout.addStretch();
addTabLayout.add(applyAddButton);
var replaceTabLayout = new ui.VLayout();
replaceTabLayout.setMargins(layoutMargin, layoutMargin, layoutMargin, layoutMargin);
replaceTabLayout.setSpaceBetween(layoutSpaceBetween);
var findLabel = new ui.Label("Find");
findLabel.setTextColor(ui.getThemeColor("Light"));
findLabel.setMinimumWidth(55);
var findLayout = new ui.HLayout();
findLayout.add(findLabel);
findLayout.add(findInput);
replaceTabLayout.add(findLayout);
var replaceLabel = new ui.Label("Replace");
replaceLabel.setMinimumWidth(55);
replaceLabel.setTextColor(ui.getThemeColor("Light"));
var replaceLayout = new ui.HLayout();
replaceLayout.add(replaceLabel);
replaceLayout.add(replaceInput);
replaceTabLayout.add(replaceLayout);
replaceTabLayout.addStretch();
replaceTabLayout.add(applyReplaceButton);
var numberTabLayout = new ui.VLayout();
numberTabLayout.setMargins(layoutMargin, layoutMargin, layoutMargin, layoutMargin);
numberTabLayout.setSpaceBetween(layoutSpaceBetween);
var startNumberLabel = new ui.Label("Number from");
startNumberLabel.setTextColor(ui.getThemeColor("Light"));
var numberFromLayout = new ui.HLayout();
numberFromLayout.add(startNumberLabel);
numberFromLayout.add(startNumberInput);
numberTabLayout.add(numberFromLayout);
var reverseLabel = new ui.Label("Reverse order");
reverseLabel.setTextColor(ui.getThemeColor("Light"));
var reverseRow = new ui.HLayout();
reverseRow.add(positionDropdown);
reverseRow.add(reverseCheckbox);
reverseRow.add(reverseLabel);
numberTabLayout.add(reverseRow);
numberTabLayout.addStretch();
numberTabLayout.add(applyNumberButton);
var tabView = new ui.TabView();
tabView.add("Add", addTabLayout);
tabView.add("Replace", replaceTabLayout);
tabView.add("Number", numberTabLayout);
var mainLayout = new ui.VLayout();
mainLayout.setMargins(0, 0, 0, 0);
mainLayout.setSpaceBetween(layoutSpaceBetween);
mainLayout.add(tabView);
var previewTitleLabel = new ui.Label("Select items and change settings to preview");
previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
mainLayout.add(previewTitleLabel);
mainLayout.add(previewScrollView);
mainLayout.addSpacing(4);
mainLayout.add(statusLabel);
mainLayout.addStretch();
prependInput.onValueChanged = function() {
  updatePreview();
};
appendInput.onValueChanged = function() {
  updatePreview();
};
applyAddButton.onClick = function() {
  applyAddText();
};
findInput.onValueChanged = function() {
  updatePreview();
};
replaceInput.onValueChanged = function() {
  updatePreview();
};
applyReplaceButton.onClick = function() {
  applyRename();
};
startNumberInput.onValueChanged = function() {
  updatePreview();
};
positionDropdown.onValueChanged = function() {
  updatePreview();
};
reverseCheckbox.onValueChanged = function() {
  updatePreview();
};
applyNumberButton.onClick = function() {
  applyNumbering();
};
ui.add(mainLayout);
ui.setBackgroundColor(ui.getThemeColor("Base"));
ui.setMinimumWidth(300);
ui.setMinimumHeight(350);
updatePreview();
ui.show();
var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "Renamer";
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
