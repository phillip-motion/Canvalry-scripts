// src/Remove Unused Assets.js
console.log("Auto-saving scene before cleanup...");
api.saveScene();
console.log("Scene saved successfully.");
var deletedAssetCount = 0;
var deletedGroupCount = 0;
var itemsToDelete = [];
do {
  itemsToDelete = [];
  assets = api.getAssetWindowLayers(false);
  assets.forEach(function(item) {
    if (api.isFileAsset(item)) {
      if (api.getOutConnections(item, "id") == "") {
        itemsToDelete.push(item);
      }
    }
  });
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
  itemsToDelete.forEach(function(item) {
    if (api.isFileAsset(item)) {
      deletedAssetCount++;
    } else {
      deletedGroupCount++;
    }
    api.deleteLayer(item);
  });
} while (itemsToDelete.length > 0);
var assets;
console.log(`Cleanup complete. Deleted ${deletedAssetCount} unused assets and ${deletedGroupCount} empty groups.`);
