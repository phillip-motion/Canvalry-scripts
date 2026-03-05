// src/Reduce Compositions.js
function deleteUnusedCompositions() {
  console.log("Auto-saving scene before cleanup...");
  api.saveScene();
  console.log("Scene saved successfully.");
  const selectedAssets = api.getSelection();
  if (selectedAssets.length === 0) {
    console.warn("No items selected. Please select one or more compositions in the Assets Window.");
    return;
  }
  const compsToKeep = /* @__PURE__ */ new Set();
  function processAssetHierarchy(itemId) {
    if (itemId.startsWith("compNode#")) {
      compsToKeep.add(itemId);
    }
    try {
      const children = api.getChildren(itemId);
      for (let childId of children) {
        if (childId.startsWith("compositionReference#")) {
          try {
            const referencedComp = api.getCompFromReference(childId);
            if (referencedComp && referencedComp.startsWith("compNode#")) {
              compsToKeep.add(referencedComp);
              processAssetHierarchy(referencedComp);
            }
          } catch (e) {
          }
        }
        processAssetHierarchy(childId);
      }
    } catch (e) {
    }
  }
  function checkCompReferences(compId) {
    if (!compId.startsWith("compNode#")) return;
    try {
      const oldActive = api.getActiveComp();
      api.setActiveComp(compId);
      const layers = api.getCompLayers(false);
      for (let layerId of layers) {
        if (layerId.startsWith("compositionReference#")) {
          try {
            const referencedComp = api.getCompFromReference(layerId);
            if (referencedComp && referencedComp.startsWith("compNode#")) {
              compsToKeep.add(referencedComp);
              checkCompReferences(referencedComp);
            }
          } catch (e) {
          }
        }
      }
      api.setActiveComp(oldActive);
    } catch (e) {
    }
  }
  console.log("Processing selected compositions and their hierarchies...");
  for (let assetId of selectedAssets) {
    processAssetHierarchy(assetId);
    if (assetId.startsWith("compNode#")) {
      checkCompReferences(assetId);
    }
  }
  console.log(`Keeping ${compsToKeep.size} composition(s) and their dependencies.`);
  const allAssets = api.getAssetWindowLayers(false);
  console.log(`Total assets in project: ${allAssets.length}`);
  let deleteCount = 0;
  let checkCount = 0;
  for (let item of allAssets) {
    if (item.startsWith("compNode#")) {
      checkCount++;
      if (!compsToKeep.has(item)) {
        try {
          api.deleteLayer(item);
          deleteCount++;
        } catch (e) {
        }
      }
    }
  }
  console.log(`
\u2713 Complete!`);
  console.log(`Found ${checkCount} total compositions`);
  console.log(`Kept ${compsToKeep.size} composition(s)`);
  console.log(`Deleted ${deleteCount} unused composition(s)`);
}
deleteUnusedCompositions();
