// Consolidate Assets Script for Cavalry
// Moves file assets from outside the Project Assets folder into it,
// optionally categorising into Audio, Footage, Fonts, Images, and Quiver subfolders.

ui.setTitle("Consolidate Assets");

// =============================================================================
// UI CONTROLS
// =============================================================================

var categorizeCheckbox = new ui.Checkbox(true);
var excludeRefsCheckbox = new ui.Checkbox(true);

var scanButton = new ui.Button("Scan for External Assets");
var consolidateButton = new ui.Button("Consolidate");

var selectAllButton = new ui.Button("All");
var selectNoneButton = new ui.Button("None");

var statusLabel = new ui.Label("");
statusLabel.setTextColor(ui.getThemeColor("Accent1"));

var previewScrollView = new ui.ScrollView();
previewScrollView.setFixedHeight(260);

var checkColumn;
var pathsColumn;
var typesColumn;
var destColumn;
var tableContainer;

// Tracks the last scan result so Consolidate can act on it
var lastScanResult = [];
// Parallel array of checkboxes — one per scan result row
var rowCheckboxes = [];

// =============================================================================
// HELPERS
// =============================================================================

function normalise(p) {
    if (p.charAt(p.length - 1) === "/") {
        return p.substring(0, p.length - 1);
    }
    return p;
}

function startsWith(str, prefix) {
    return str.substring(0, prefix.length) === prefix;
}

function endsWith(str, suffix) {
    if (suffix.length > str.length) return false;
    return str.substring(str.length - suffix.length) === suffix;
}

function fileNameFromPath(p) {
    var idx = p.lastIndexOf("/");
    if (idx === -1) return p;
    return p.substring(idx + 1);
}

function baseNameFromPath(p) {
    var name = fileNameFromPath(p);
    var dot = name.lastIndexOf(".");
    if (dot <= 0) return name;
    return name.substring(0, dot);
}

function extensionFromPath(p) {
    var name = fileNameFromPath(p);
    var dot = name.lastIndexOf(".");
    if (dot <= 0) return "";
    return name.substring(dot);
}

function isReferenceFile(filePath) {
    var lower = filePath.toLowerCase();
    return endsWith(lower, ".cv") || endsWith(lower, ".cvc");
}

function isQuiverAsset(assetId, filePath) {
    if (filePath.indexOf("/Quiver/") !== -1) return true;
    try {
        var parentId = api.getParent(assetId);
        if (parentId && parentId !== "") {
            var parentName = api.getNiceName(parentId);
            if (parentName === "Quiver") return true;
        }
    } catch (e) {}
    return false;
}

function subfolder(assetType, assetId, filePath) {
    if (isQuiverAsset(assetId, filePath)) return "Quiver";
    if (assetType === "audio") return "Audio";
    if (assetType === "movie") return "Footage";
    if (assetType === "font") return "Fonts";
    if (assetType === "image" || assetType === "svg") return "Images";
    return "";
}

function uniqueDest(destPath) {
    if (!api.filePathExists(destPath)) return destPath;
    var base = baseNameFromPath(destPath);
    var ext = extensionFromPath(destPath);
    var dir = destPath.substring(0, destPath.lastIndexOf("/"));
    for (var i = 1; i < 1000; i++) {
        var candidate = dir + "/" + base + "_" + i + ext;
        if (!api.filePathExists(candidate)) return candidate;
    }
    return destPath;
}

function checkedCount() {
    var n = 0;
    for (var i = 0; i < rowCheckboxes.length; i++) {
        if (rowCheckboxes[i].getValue()) n++;
    }
    return n;
}

function updateTitle() {
    if (lastScanResult.length === 0) return;
    var checked = checkedCount();
    previewTitleLabel.setText(
        lastScanResult.length + " external asset" + (lastScanResult.length !== 1 ? "s" : "") +
        " found, " + checked + " selected:"
    );
    previewTitleLabel.setTextColor("#ffffff");
}

// =============================================================================
// SCAN
// =============================================================================

function scanExternalAssets() {
    var assetsPath = "";
    try { assetsPath = api.getAssetPath(); } catch (e) {}
    if (!assetsPath || assetsPath === "") {
        statusLabel.setText("No Project set. Set a Project first via Assets > Project Settings.");
        statusLabel.setTextColor("#ff6666");
        lastScanResult = [];
        return [];
    }
    assetsPath = normalise(assetsPath);

    var excludeRefs = excludeRefsCheckbox.getValue();
    var allAssets = api.getAssetWindowLayers(false);
    var external = [];
    var categorize = categorizeCheckbox.getValue();

    for (var i = 0; i < allAssets.length; i++) {
        var id = allAssets[i];
        if (!api.isFileAsset(id)) continue;

        var assetType = "";
        try { assetType = api.getAssetType(id); } catch (e) {}
        if (assetType === "unknown" || assetType === "") continue;

        var filePath = "";
        try { filePath = api.getAssetFilePath(id); } catch (e) {}
        if (!filePath || filePath === "") continue;

        if (excludeRefs && isReferenceFile(filePath)) continue;

        if (!api.filePathExists(filePath)) continue;

        if (startsWith(normalise(filePath), assetsPath)) continue;

        var sub = categorize ? subfolder(assetType, id, filePath) : "";
        var targetDir = sub !== "" ? assetsPath + "/" + sub : assetsPath;
        var targetPath = targetDir + "/" + fileNameFromPath(filePath);

        external.push({
            id: id,
            name: api.getNiceName(id),
            type: assetType,
            srcPath: filePath,
            targetDir: targetDir,
            targetPath: targetPath,
            sub: sub
        });
    }

    lastScanResult = external;
    return external;
}

// =============================================================================
// PREVIEW TABLE
// =============================================================================

function clearPreviewTable() {
    rowCheckboxes = [];

    checkColumn = new ui.VLayout();
    checkColumn.setSpaceBetween(2);
    pathsColumn = new ui.VLayout();
    pathsColumn.setSpaceBetween(2);
    typesColumn = new ui.VLayout();
    typesColumn.setSpaceBetween(2);
    destColumn = new ui.VLayout();
    destColumn.setSpaceBetween(2);

    tableContainer = new ui.HLayout();
    tableContainer.setSpaceBetween(4);
    tableContainer.add(checkColumn);
    tableContainer.add(pathsColumn);
    tableContainer.add(typesColumn);
    tableContainer.add(destColumn);

    previewScrollView.setLayout(tableContainer);
}

function updatePreview(results) {
    clearPreviewTable();
    if (!results || results.length === 0) return;

    for (var i = 0; i < results.length; i++) {
        var r = results[i];

        var cb = new ui.Checkbox(true);
        cb.onValueChanged = function () { updateTitle(); };
        rowCheckboxes.push(cb);
        checkColumn.add(cb);

        var nameLabel = new ui.Label(r.name);
        nameLabel.setTextColor(ui.getThemeColor("Text"));
        pathsColumn.add(nameLabel);

        var typeLabel = new ui.Label(r.type);
        typeLabel.setTextColor(ui.getThemeColor("Midlight"));
        typeLabel.setFixedWidth(60);
        typesColumn.add(typeLabel);

        var destLabel = new ui.Label(r.sub !== "" ? r.sub + "/" : "Assets/");
        destLabel.setTextColor(ui.getThemeColor("Accent1"));
        destColumn.add(destLabel);
    }
}

// =============================================================================
// CONSOLIDATE
// =============================================================================

function doConsolidate() {
    var assetsPath = "";
    try { assetsPath = api.getAssetPath(); } catch (e) {}
    if (!assetsPath || assetsPath === "") {
        statusLabel.setText("No Project set. Set a Project first via Assets > Project Settings.");
        statusLabel.setTextColor("#ff6666");
        return;
    }

    if (lastScanResult.length === 0 || checkedCount() === 0) {
        statusLabel.setText("Nothing to consolidate. Scan and select assets first.");
        statusLabel.setTextColor(ui.getThemeColor("Light"));
        return;
    }

    console.log("Auto-saving scene before consolidation...");
    api.saveScene();

    var moved = 0;
    var failed = 0;
    var skipped = 0;
    var dirsCreated = {};

    for (var i = 0; i < lastScanResult.length; i++) {
        if (!rowCheckboxes[i].getValue()) {
            skipped++;
            continue;
        }

        var r = lastScanResult[i];

        if (!dirsCreated[r.targetDir]) {
            if (!api.filePathExists(r.targetDir)) {
                try {
                    api.makeFolder(r.targetDir);
                } catch (e) {
                    console.log("Could not create folder " + r.targetDir + ": " + e);
                }
            }
            dirsCreated[r.targetDir] = true;
        }

        var dest = uniqueDest(r.targetPath);

        try {
            var copied = api.copyFilePath(r.srcPath, dest);
            if (!copied) {
                console.log("Copy failed for: " + r.name + " (" + r.srcPath + ")");
                failed++;
                continue;
            }
        } catch (e) {
            console.log("Copy error for " + r.name + ": " + e);
            failed++;
            continue;
        }

        try {
            api.replaceAsset(r.id, dest);
            moved++;
            console.log("Consolidated: " + r.name + " -> " + dest);
        } catch (e) {
            console.log("Relink error for " + r.name + ": " + e);
            failed++;
        }
    }

    var msg = "Done. Consolidated " + moved + " asset" + (moved !== 1 ? "s" : "") + ".";
    if (skipped > 0) {
        msg += " " + skipped + " skipped.";
    }
    if (failed > 0) {
        msg += " " + failed + " failed (see Console).";
    }
    statusLabel.setText(msg);
    statusLabel.setTextColor(failed > 0 ? "#ff6666" : ui.getThemeColor("Accent1"));
    console.log(msg);

    lastScanResult = [];
    clearPreviewTable();
}

// =============================================================================
// LAYOUT
// =============================================================================

var margin = 2;
var spacing = 6;

var mainLayout = new ui.VLayout();
mainLayout.setMargins(margin, margin, margin, margin);
mainLayout.setSpaceBetween(spacing);

// Options row
var categorizeLabel = new ui.Label("Categorize by type");
categorizeLabel.setTextColor(ui.getThemeColor("Light"));
var categorizeRow = new ui.HLayout();
categorizeRow.add(categorizeCheckbox);
categorizeRow.add(categorizeLabel);
categorizeRow.addStretch();
mainLayout.add(categorizeRow);

subfolderHint.setTextColor(ui.getThemeColor("Midlight"));
mainLayout.add(subfolderHint);

var excludeRefsLabel = new ui.Label("Exclude reference comps (.cv/.cvc)");
excludeRefsLabel.setTextColor(ui.getThemeColor("Light"));
var excludeRefsRow = new ui.HLayout();
excludeRefsRow.add(excludeRefsCheckbox);
excludeRefsRow.add(excludeRefsLabel);
mainLayout.add(excludeRefsRow);

mainLayout.addSpacing(2);
mainLayout.add(scanButton);

// Preview header
var previewHeaderRow = new ui.HLayout();
var previewTitleLabel = new ui.Label("External assets will appear here after scanning.");
previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
previewHeaderRow.add(previewTitleLabel);
previewHeaderRow.addStretch();
previewHeaderRow.add(selectAllButton);
previewHeaderRow.add(selectNoneButton);
mainLayout.add(previewHeaderRow);

mainLayout.add(previewScrollView);

mainLayout.add(consolidateButton);

mainLayout.addSpacing(2);
mainLayout.add(statusLabel);
mainLayout.addStretch();

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function runScan() {
    statusLabel.setText("");
    var hadError = false;
    var assetsPath = "";
    try { assetsPath = api.getAssetPath(); } catch (e) {}
    if (!assetsPath || assetsPath === "") {
        hadError = true;
    }
    var results = scanExternalAssets();
    updatePreview(results);
    if (results.length === 0 && !hadError) {
        previewTitleLabel.setText("All assets are already inside the Project Assets folder.");
        previewTitleLabel.setTextColor(ui.getThemeColor("Accent1"));
    } else if (results.length > 0) {
        updateTitle();
    }
}

scanButton.onClick = function () { runScan(); };

categorizeCheckbox.onValueChanged = function () {
    subfolderHint.setTextColor(categorizeCheckbox.getValue() ? ui.getThemeColor("Midlight") : ui.getThemeColor("Dark"));
    if (lastScanResult.length > 0) runScan();
};

excludeRefsCheckbox.onValueChanged = function () {
    if (lastScanResult.length > 0) runScan();
};

selectAllButton.onClick = function () {
    for (var i = 0; i < rowCheckboxes.length; i++) {
        rowCheckboxes[i].setValue(true);
    }
    updateTitle();
};

selectNoneButton.onClick = function () {
    for (var i = 0; i < rowCheckboxes.length; i++) {
        rowCheckboxes[i].setValue(false);
    }
    updateTitle();
};

consolidateButton.onClick = function () { doConsolidate(); };

// =============================================================================
// INIT
// =============================================================================

clearPreviewTable();
ui.add(mainLayout);
ui.setBackgroundColor(ui.getThemeColor("Base"));
ui.setMinimumWidth(380);
ui.setMinimumHeight(440);
ui.show();
