// Unused Asset Finder Script for Cavalry
// Scans selected compositions (and nested comps) to identify assets not used by them.

ui.setTitle("Unused Asset Finder");

// =============================================================================
// UI CONTROLS
// =============================================================================

var scanButton = new ui.Button("Scan Selected Comps");
var moveButton = new ui.Button("Move to Unused");

var selectAllButton = new ui.Button("All");
var selectNoneButton = new ui.Button("None");

var statusLabel = new ui.Label("Select compositions in the Assets panel, then click Scan.");
statusLabel.setTextColor(ui.getThemeColor("Light"));

var previewScrollView = new ui.ScrollView();
previewScrollView.setFixedHeight(300);

var rowsContainer;

var lastScanResult = [];
var rowCheckboxes = [];

// =============================================================================
// HELPERS
// =============================================================================

function startsWith(str, prefix) {
    return str.substring(0, prefix.length) === prefix;
}

function extractLayerId(connectionStr) {
    var dotIndex = connectionStr.indexOf(".");
    if (dotIndex === -1) return connectionStr;
    return connectionStr.substring(0, dotIndex);
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
        lastScanResult.length + " unused item" + (lastScanResult.length !== 1 ? "s" : "") +
        " found, " + checked + " selected"
    );
    statusLabel.setTextColor(ui.getThemeColor("Accent1"));
}

function findUnusedFolder() {
    var topLevel = api.getAssetWindowLayers(true);
    for (var i = 0; i < topLevel.length; i++) {
        var id = topLevel[i];
        if (startsWith(id, "compNode#")) continue;
        try {
            if (api.isFileAsset(id)) continue;
        } catch (e) {}
        try {
            if (api.getNiceName(id) === "Unused") return id;
        } catch (e) {}
    }
    return null;
}

function getOrCreateUnusedFolder() {
    var existing = findUnusedFolder();
    if (existing) return existing;
    return api.createAssetGroup("Unused");
}

function collectAllDescendants(parentId, out) {
    try {
        var children = api.getChildren(parentId);
        for (var i = 0; i < children.length; i++) {
            out[children[i]] = true;
            collectAllDescendants(children[i], out);
        }
    } catch (e) {}
}

// =============================================================================
// SCAN LOGIC
// =============================================================================

function isAssetUsedInLayers(assetId, usedLayers) {
    try {
        var connections = api.getOutConnections(assetId, "id");
        if (!connections || connections == "") return false;

        var connList;
        if (typeof connections === "string") {
            connList = connections.indexOf(",") !== -1 ? connections.split(",") : [connections];
        } else {
            connList = connections;
        }

        for (var i = 0; i < connList.length; i++) {
            var conn = connList[i];
            if (!conn || conn === "") continue;
            var layerId = extractLayerId(conn.replace(/^\s+|\s+$/g, ""));
            if (usedLayers[layerId]) return true;
        }
    } catch (e) {}
    return false;
}

function scanUnusedAssets() {
    var selection = api.getSelection();
    if (!selection || selection.length === 0) {
        return { error: "No items selected. Select one or more compositions in the Assets panel." };
    }

    var originalComp = api.getActiveComp();
    var usedComps = {};
    var usedLayers = {};
    var assetHierarchyVisited = {};
    var compWalked = {};

    // Phase 1: walk the asset-panel hierarchy under the selection to find all compNode IDs
    function processAssetHierarchy(itemId) {
        if (assetHierarchyVisited[itemId]) return;
        assetHierarchyVisited[itemId] = true;

        if (startsWith(itemId, "compNode#")) {
            usedComps[itemId] = true;
        }

        try {
            var children = api.getChildren(itemId);
            for (var i = 0; i < children.length; i++) {
                var childId = children[i];
                if (startsWith(childId, "compositionReference#")) {
                    try {
                        var refComp = api.getCompFromReference(childId);
                        if (refComp && startsWith(refComp, "compNode#")) {
                            usedComps[refComp] = true;
                            processAssetHierarchy(refComp);
                        }
                    } catch (e) {}
                }
                processAssetHierarchy(childId);
            }
        } catch (e) {}
    }

    for (var s = 0; s < selection.length; s++) {
        processAssetHierarchy(selection[s]);
    }

    // Phase 2: for each used comp, activate it, collect all layer IDs, and discover nested comp refs
    function walkCompTimeline(compId) {
        if (compWalked[compId]) return;
        compWalked[compId] = true;

        try {
            api.setActiveComp(compId);
            var layers = api.getCompLayers(false);
            for (var i = 0; i < layers.length; i++) {
                var layerId = layers[i];
                usedLayers[layerId] = true;

                if (startsWith(layerId, "compositionReference#")) {
                    try {
                        var refComp = api.getCompFromReference(layerId);
                        if (refComp && startsWith(refComp, "compNode#") && !usedComps[refComp]) {
                            usedComps[refComp] = true;
                            walkCompTimeline(refComp);
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }

    var initialComps = Object.keys(usedComps);
    for (var c = 0; c < initialComps.length; c++) {
        walkCompTimeline(initialComps[c]);
    }

    try { api.setActiveComp(originalComp); } catch (e) {}

    // Phase 3: classify every asset-window item
    var allAssets = api.getAssetWindowLayers(false);
    var unused = [];

    var unusedFolderId = findUnusedFolder();
    var unusedFolderDescendants = {};
    if (unusedFolderId) {
        unusedFolderDescendants[unusedFolderId] = true;
        collectAllDescendants(unusedFolderId, unusedFolderDescendants);
    }

    // Build a lookup of the selection for quick exclusion
    var selectionSet = {};
    for (var i = 0; i < selection.length; i++) {
        selectionSet[selection[i]] = true;
    }

    for (var a = 0; a < allAssets.length; a++) {
        var item = allAssets[a];

        if (selectionSet[item]) continue;
        if (unusedFolderDescendants[item]) continue;

        if (startsWith(item, "compNode#")) {
            if (!usedComps[item]) {
                var compName = "";
                try { compName = api.getNiceName(item); } catch (e) { compName = item; }
                unused.push({ id: item, name: compName, type: "comp" });
            }
        } else {
            var isFile = false;
            try { isFile = api.isFileAsset(item); } catch (e) {}

            if (isFile) {
                if (!isAssetUsedInLayers(item, usedLayers)) {
                    var assetType = "file";
                    try { assetType = api.getAssetType(item); } catch (e) {}
                    if (assetType === "unknown") assetType = "file";
                    var assetName = "";
                    try { assetName = api.getNiceName(item); } catch (e) { assetName = item; }
                    unused.push({ id: item, name: assetName, type: assetType });
                }
            } else {
                // Asset group / folder
                try {
                    if (api.getAssetType(item) === "unknown") {
                        var children = api.getChildren(item);
                        if (children.length === 0) {
                            var folderName = "";
                            try { folderName = api.getNiceName(item); } catch (e) { folderName = item; }
                            unused.push({ id: item, name: folderName, type: "folder" });
                        }
                    }
                } catch (e) {}
            }
        }
    }

    return { items: unused };
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
// MOVE TO UNUSED
// =============================================================================

function doMoveToUnused() {
    if (lastScanResult.length === 0 || checkedCount() === 0) {
        statusLabel.setText("Nothing to move. Scan first and select items.");
        statusLabel.setTextColor(ui.getThemeColor("Light"));
        return;
    }

    var unusedFolder = getOrCreateUnusedFolder();
    if (!unusedFolder) {
        statusLabel.setText("Could not create Unused folder.");
        statusLabel.setTextColor("#ff6666");
        return;
    }

    var moved = 0;
    var failed = 0;

    for (var i = 0; i < lastScanResult.length; i++) {
        if (!rowCheckboxes[i].getValue()) continue;
        try {
            api.parent(lastScanResult[i].id, unusedFolder);
            moved++;
        } catch (e) {
            console.log("Failed to move " + lastScanResult[i].name + ": " + e);
            failed++;
        }
    }

    var msg = "Moved " + moved + " item" + (moved !== 1 ? "s" : "") + " to Unused folder.";
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

mainLayout.add(scanButton);
mainLayout.addSpacing(2);

var previewHeaderRow = new ui.HLayout();
var previewTitleLabel = new ui.Label("Unused items");
previewTitleLabel.setTextColor(ui.getThemeColor("Light"));
previewHeaderRow.add(previewTitleLabel);
previewHeaderRow.addStretch();
previewHeaderRow.add(selectAllButton);
previewHeaderRow.add(selectNoneButton);
mainLayout.add(previewHeaderRow);

mainLayout.add(previewScrollView);
mainLayout.add(statusLabel);
mainLayout.addSpacing(2);
mainLayout.add(moveButton);

// =============================================================================
// EVENT HANDLERS
// =============================================================================

scanButton.onClick = function () {
    statusLabel.setText("Scanning...");
    statusLabel.setTextColor(ui.getThemeColor("Light"));
    clearPreviewTable();
    lastScanResult = [];

    var result = scanUnusedAssets();
    if (result.error) {
        statusLabel.setText(result.error);
        statusLabel.setTextColor("#ff6666");
        return;
    }

    lastScanResult = result.items;
    updatePreview(lastScanResult);

    if (lastScanResult.length === 0) {
        statusLabel.setText("No unused assets found. Everything is used by the selected compositions.");
        statusLabel.setTextColor(ui.getThemeColor("Accent1"));
    } else {
        updateTitle();
    }
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

moveButton.onClick = function () { doMoveToUnused(); };

// =============================================================================
// INIT
// =============================================================================

clearPreviewTable();
ui.add(mainLayout);
ui.setBackgroundColor(ui.getThemeColor("Base"));
ui.setMinimumWidth(380);
ui.setMinimumHeight(440);
ui.show();

// =============================================================================
// UPDATE CHECKER
// =============================================================================

var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "Unused Asset Finder";
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
