// Auto-save the scene before removing unused assets
console.log("Auto-saving scene before cleanup...");
api.saveScene();
console.log("Scene saved successfully.");

var deletedAssetCount = 0;
var deletedGroupCount = 0;
var itemsToDelete = [];

// Keep running cleanup passes until nothing more can be deleted
do {
    itemsToDelete = [];
    var assets = api.getAssetWindowLayers(false);
    
    // First identify unused assets
    assets.forEach(function(item) {
        if (api.isFileAsset(item)) {
            if (api.getOutConnections(item, "id") == "") {
                itemsToDelete.push(item);
            }
        }
    });
    
    // Then identify empty groups
    assets.forEach(function(item) {
        if (!api.isFileAsset(item)) {
            var children = api.getChildren(item);
            if (children.length === 0) {
                if (api.getAssetType(item) === "unknown") {
                    itemsToDelete.push(item);
                }
            }
        }
    });
    
    // Now delete all identified items
    itemsToDelete.forEach(function(item) {
        if (api.isFileAsset(item)) {
            deletedAssetCount++;
        } else {
            deletedGroupCount++;
        }
        api.deleteLayer(item);
    });
    
} while (itemsToDelete.length > 0); // Keep going until no more items to delete

console.log(`Cleanup complete. Deleted ${deletedAssetCount} unused assets and ${deletedGroupCount} empty groups.`);