// Consolidate Assets Script for Cavalry
// Moves file assets from outside the Project Assets folder into it,
// optionally categorising into Audio, Footage, Fonts, Images, and Quiver subfolders.

ui.setTitle("Consolidate Assets");

// =============================================================================
// UI CONTROLS
// =============================================================================

var categorizeCheckbox = new ui.Checkbox(true);
var sceneSubfolderCheckbox = new ui.Checkbox(false);
var moveInternalCheckbox = new ui.Checkbox(false);
var excludeRefsCheckbox = new ui.Checkbox(true);

var scanButton = new ui.Button("Refresh");
var consolidateButton = new ui.Button("Consolidate");

var selectAllButton = new ui.Button("All");
var selectNoneButton = new ui.Button("None");

var statusLabel = new ui.Label("");
statusLabel.setTextColor(ui.getThemeColor("Accent1"));

var previewScrollView = new ui.ScrollView();
previewScrollView.setFixedHeight(260);

var rowsContainer;

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

function deriveSceneFolder() {
    var scenePath = "";
    try { scenePath = api.getSceneFilePath(); } catch (e) {}
    if (!scenePath || scenePath === "") return "";

    var base = baseNameFromPath(scenePath);
    // Strip trailing version: _v01, _v2.1, _V120
    base = base.replace(/_[vV]\d+(\.\d+)?$/, "");
    // Strip trailing bare number: _1, _02, _123
    base = base.replace(/_\d+$/, "");
    // Strip trailing 2-letter initials: _AA, _Xz
    base = base.replace(/_[A-Za-z]{2}$/, "");
    return base;
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
    statusLabel.setText(
        lastScanResult.length + " external asset" + (lastScanResult.length !== 1 ? "s" : "") +
        " found, " + checked + " selected"
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
    var useSceneFolder = sceneSubfolderCheckbox.getValue();
    var sceneFolder = useSceneFolder ? deriveSceneFolder() : "";
    var moveInternal = moveInternalCheckbox.getValue() && useSceneFolder && sceneFolder !== "";
    var sceneFolderPath = sceneFolder !== "" ? assetsPath + "/" + sceneFolder : "";

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

        var normPath = normalise(filePath);
        var isInternal = startsWith(normPath, assetsPath);

        if (isInternal) {
            if (!moveInternal) continue;
            if (sceneFolderPath !== "" && startsWith(normPath, sceneFolderPath)) continue;
        }

        var sub = categorize ? subfolder(assetType, id, filePath) : "";
        var targetDir = assetsPath;
        if (sceneFolder !== "") targetDir += "/" + sceneFolder;
        if (sub !== "") targetDir += "/" + sub;
        var targetPath = targetDir + "/" + fileNameFromPath(filePath);

        external.push({
            id: id,
            name: api.getNiceName(id),
            type: assetType,
            srcPath: filePath,
            targetDir: targetDir,
            targetPath: targetPath,
            sub: sub,
            isInternal: isInternal
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
    rowsContainer = new ui.VLayout();
    rowsContainer.setSpaceBetween(2);
    previewScrollView.setLayout(rowsContainer);
}

function updatePreview(results) {
    clearPreviewTable();
    if (!results || results.length === 0) return;

    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var row = new ui.HLayout();
        row.setSpaceBetween(6);

        var cb = new ui.Checkbox(true);
        cb.onValueChanged = function () { updateTitle(); };
        rowCheckboxes.push(cb);
        row.add(cb);

        var displayName = r.name.length > 45 ? r.name.substring(0, 42) + "..." : r.name;
        var nameLabel = new ui.Label(displayName.split(" ").join("\u00A0"));
        nameLabel.setTextColor(ui.getThemeColor("Text"));
        row.add(nameLabel);

        row.addStretch();

        var typeLabel = new ui.Label(r.type);
        typeLabel.setTextColor(ui.getThemeColor("Midlight"));
        row.add(typeLabel);

        rowsContainer.add(row);
    }
    rowsContainer.addStretch();
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

    var hasInternal = false;
    for (var c = 0; c < lastScanResult.length; c++) {
        if (rowCheckboxes[c].getValue() && lastScanResult[c].isInternal) {
            hasInternal = true;
            break;
        }
    }
    if (hasInternal) {
        var modal = new ui.Modal();
        var proceed = modal.showQuestion(
            "Move files",
            "This will delete selected files from their original location and move them into the scene subfolder. Make sure no one else is using these files.\n\nContinue?"
        );
        if (!proceed) return;
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
            continue;
        }

        if (r.isInternal) {
            try {
                api.deleteFilePath(r.srcPath);
            } catch (e) {
                console.log("Could not remove original: " + r.srcPath + ": " + e);
            }
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

var sceneSubfolderLabel = new ui.Label("Group assets in scene subfolder");
sceneSubfolderLabel.setTextColor(ui.getThemeColor("Light"));
var sceneSubfolderRow = new ui.HLayout();
sceneSubfolderRow.add(sceneSubfolderCheckbox);
sceneSubfolderRow.add(sceneSubfolderLabel);
mainLayout.add(sceneSubfolderRow);

var moveInternalLabel = new ui.Label("Move existing assets into scene subfolder");
moveInternalLabel.setTextColor(ui.getThemeColor("Light"));
var moveInternalRow = new ui.HLayout();
moveInternalRow.add(moveInternalCheckbox);
moveInternalRow.add(moveInternalLabel);
mainLayout.add(moveInternalRow);
moveInternalCheckbox.setHidden(true);
moveInternalLabel.setHidden(true);

var excludeRefsLabel = new ui.Label("Exclude reference comps (.cv/.cvc)");
excludeRefsLabel.setTextColor(ui.getThemeColor("Light"));
var excludeRefsRow = new ui.HLayout();
excludeRefsRow.add(excludeRefsCheckbox);
excludeRefsRow.add(excludeRefsLabel);
mainLayout.add(excludeRefsRow);

mainLayout.addSpacing(2);

// Preview header
var previewHeaderRow = new ui.HLayout();
var previewTitleLabel = new ui.Label("Select");
previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
previewHeaderRow.add(previewTitleLabel);
previewHeaderRow.addStretch();
previewHeaderRow.add(selectAllButton);
previewHeaderRow.add(selectNoneButton);
mainLayout.add(previewHeaderRow);

mainLayout.add(previewScrollView);
mainLayout.add(statusLabel);
mainLayout.addSpacing(2);

var consolidateRow = new ui.HLayout();
consolidateRow.add(scanButton);
consolidateRow.add(consolidateButton);
mainLayout.add(consolidateRow);

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
        statusLabel.setText("All assets are already inside the Project Assets folder.");
        statusLabel.setTextColor(ui.getThemeColor("Accent1"));
    } else if (results.length > 0) {
        updateTitle();
    }
}

scanButton.onClick = function () { runScan(); };

categorizeCheckbox.onValueChanged = function () {
    if (lastScanResult.length > 0) runScan();
};

sceneSubfolderCheckbox.onValueChanged = function () {
    var on = sceneSubfolderCheckbox.getValue();
    moveInternalCheckbox.setHidden(!on);
    moveInternalLabel.setHidden(!on);
    if (!on) moveInternalCheckbox.setValue(false);
    if (lastScanResult.length > 0) runScan();
};

moveInternalCheckbox.onValueChanged = function () {
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

ui.add(mainLayout);
ui.setBackgroundColor(ui.getThemeColor("Base"));
ui.setMinimumWidth(380);
ui.setMinimumHeight(440);
ui.show();
runScan();

// =============================================================================
// UPDATE CHECKER
// =============================================================================

var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "Consolidate Assets";
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
