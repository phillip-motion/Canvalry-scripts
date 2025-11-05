// Renamer Script for Cavalry
// Add, Replace, or Number assets or layers

// Set window title
ui.setTitle("Asset Panel Renamer");

// =============================================================================
// ADD TAB CONTROLS
// =============================================================================
var prependInput = new ui.LineEdit();
prependInput.setPlaceholder("Prepend text...");

var appendInput = new ui.LineEdit();
appendInput.setPlaceholder("Append text...");

var applyAddButton = new ui.Button("Apply");

// =============================================================================
// REPLACE TAB CONTROLS (Original functionality)
// =============================================================================
var findInput = new ui.LineEdit();
findInput.setPlaceholder("Text to find...");

var replaceInput = new ui.LineEdit();
replaceInput.setPlaceholder("Replacement text...");

var applyReplaceButton = new ui.Button("Apply");

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

var applyNumberButton = new ui.Button("Apply");

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

// Create ScrollView for the table (we'll recreate the table container each update)
var previewScrollView = new ui.ScrollView();
previewScrollView.setFixedHeight(200);

// These will be recreated on each update
var originalNamesColumn;
var arrowsColumn;
var newNamesColumn;
var tableContainer;

var statusLabel = new ui.Label("");
statusLabel.setTextColor(ui.getThemeColor("Accent1"));

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Clear and recreate the preview table
function clearPreviewTable() {
    // Recreate all column layouts from scratch
    originalNamesColumn = new ui.VLayout();
    originalNamesColumn.setSpaceBetween(2);
    
    arrowsColumn = new ui.VLayout();
    arrowsColumn.setSpaceBetween(2);
    
    newNamesColumn = new ui.VLayout();
    newNamesColumn.setSpaceBetween(2);
    
    // Recreate table container
    tableContainer = new ui.HLayout();
    tableContainer.setSpaceBetween(0);
    tableContainer.add(originalNamesColumn);
    tableContainer.add(arrowsColumn);
    tableContainer.add(newNamesColumn);
    
    // Update ScrollView with new container
    previewScrollView.setLayout(tableContainer);
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
    var currentTab = tabView.currentTab();
    
    // Clear the preview table
    clearPreviewTable();
    
    // Update preview title based on selection
    if (selectedAssets.length === 0) {
        previewTitleLabel.setText("Select items and change settings to preview");
        previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
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
            previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
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
            previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
        } else {
            var countText = selectedAssets.length + " asset" + (selectedAssets.length > 1 ? "s" : "") + " selected - " + changesCount + " will be modified";
            previewTitleLabel.setText(countText);
            previewTitleLabel.setTextColor("#ffffff");
        }
    }
    
    // REPLACE TAB (Tab 1)
    else if (currentTab === 1) {
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
                changesList.push({oldName: oldName, newName: newName});
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
    }
    
    // NUMBER TAB (Tab 2)
    else if (currentTab === 2) {
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
            previewTitleLabel.setTextColor("#ffffff");
        }
    }
    
    // Populate the table with changes
    for (var i = 0; i < changesList.length; i++) {
        // Original name label
        var oldNameLabel = new ui.Label(changesList[i].oldName);
        oldNameLabel.setTextColor(ui.getThemeColor("Text"));
        originalNamesColumn.add(oldNameLabel);
        
        // Arrow label
        var arrowLabel = new ui.Label("→");
        arrowLabel.setTextColor(ui.getThemeColor("Midlight"));
        arrowLabel.setAlignment(1); // Center alignment
        arrowLabel.setFixedWidth(12);
        arrowsColumn.add(arrowLabel);
        
        // New name label
        var newNameLabel = new ui.Label(changesList[i].newName);
        newNameLabel.setTextColor(ui.getThemeColor("Accent1"));
        newNamesColumn.add(newNameLabel);
    }
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
        statusLabel.setTextColor("#ff6666");
        console.warn("No items selected. Please select one or more items in the Assets panel.");
        return;
    }
    
    if (prependText === "" && appendText === "") {
        statusLabel.setText("❌ Enter text to prepend and/or append!");
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
                console.log("Renamed: " + oldName + " → " + newName);
            } catch (e) {
                console.error("Failed to rename: " + oldName + " - " + e.message);
            }
        }
    }
    
    statusLabel.setText("✓ Renamed " + renamedCount + " asset(s)");
    statusLabel.setTextColor(ui.getThemeColor("Accent1"));
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
        statusLabel.setTextColor("#ff6666");
        console.warn("No items selected. Please select one or more items in the Assets panel.");
        return;
    }
    
    if (findText === "") {
        statusLabel.setText("❌ 'Find' field is empty!");
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
                console.log("Renamed: " + oldName + " → " + newName);
            } catch (e) {
                console.error("Failed to rename: " + oldName + " - " + e.message);
            }
        }
    }
    
    statusLabel.setText("✓ Renamed " + renamedCount + " asset(s)");
    statusLabel.setTextColor(ui.getThemeColor("Accent1"));
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
        statusLabel.setTextColor("#ff6666");
        console.warn("No items selected. Please select one or more items in the Assets panel.");
        return;
    }
    
    var startNum = parseInt(startStr);
    if (isNaN(startNum)) {
        statusLabel.setText("❌ Invalid start number!");
        statusLabel.setTextColor("#ff6666");
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
    statusLabel.setTextColor(ui.getThemeColor("Accent1"));
    console.log("Numbering complete! Changed " + renamedCount + " asset name(s).");
    
    updatePreview();
}

// =============================================================================
// TAB LAYOUTS
// =============================================================================

// ADD TAB LAYOUT
var layoutMargin = 2;
var layoutSpaceBetween = 4;

var addTabLayout = new ui.VLayout();
addTabLayout.setMargins(layoutMargin,layoutMargin,layoutMargin,layoutMargin);
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

// REPLACE TAB LAYOUT
var replaceTabLayout = new ui.VLayout();
replaceTabLayout.setMargins(layoutMargin,layoutMargin,layoutMargin,layoutMargin);
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

// NUMBER TAB LAYOUT
var numberTabLayout = new ui.VLayout();
numberTabLayout.setMargins(layoutMargin,layoutMargin,layoutMargin,layoutMargin);
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

// =============================================================================
// MAIN LAYOUT WITH TABVIEW
// =============================================================================

// Create TabView
var tabView = new ui.TabView();
tabView.add("Add", addTabLayout);
tabView.add("Replace", replaceTabLayout);
tabView.add("Number", numberTabLayout);

// Create main layout
var mainLayout = new ui.VLayout();
mainLayout.setMargins(0, 0, 0, 0);
mainLayout.setSpaceBetween(layoutSpaceBetween);

// Add TabView
mainLayout.add(tabView);

// Add shared preview section
var previewTitleLabel = new ui.Label("Select items and change settings to preview");
previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
mainLayout.add(previewTitleLabel);
mainLayout.add(previewScrollView);

// Add shared status
mainLayout.addSpacing(4);
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
ui.setBackgroundColor(ui.getThemeColor("Base"));
ui.setMinimumWidth(300);
ui.setMinimumHeight(350);

// Initial preview update
updatePreview();

// Show the window
ui.show();
