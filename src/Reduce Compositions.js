// Delete Unused Compositions Script for Cavalry
// ULTRA-FAST VERSION - Properly handles composition references


function deleteUnusedCompositions() {
    // Auto-save the scene before cleanup
    console.log("Auto-saving scene before cleanup...");
    api.saveScene();
    console.log("Scene saved successfully.");
    
    const selectedAssets = api.getSelection();
    
    if (selectedAssets.length === 0) {
        console.warn("No items selected. Please select one or more compositions in the Assets Window.");
        return;
    }
    
    // Build set of compositions to keep
    const compsToKeep = new Set();
    
    // Process ALL children in the Assets Window hierarchy
    function processAssetHierarchy(itemId) {
        // If it's a composition, add to keep list
        if (itemId.startsWith("compNode#")) {
            compsToKeep.add(itemId);
        }
        
        // Get all children in the Assets Window
        try {
            const children = api.getChildren(itemId);
            for (let childId of children) {
                // Check if child is a composition reference and get the actual comp
                if (childId.startsWith("compositionReference#")) {
                    try {
                        const referencedComp = api.getCompFromReference(childId);
                        if (referencedComp && referencedComp.startsWith("compNode#")) {
                            compsToKeep.add(referencedComp);
                            // Also process the referenced composition's hierarchy
                            processAssetHierarchy(referencedComp);
                        }
                    } catch (e) {}
                }
                // Recursively process all children
                processAssetHierarchy(childId);
            }
        } catch (e) {}
    }
    
    // Also check for composition references in the Scene Window
    function checkCompReferences(compId) {
        if (!compId.startsWith("compNode#")) return;
        
        try {
            const oldActive = api.getActiveComp();
            api.setActiveComp(compId);
            
            // Get all layers in this composition
            const layers = api.getCompLayers(false);
            for (let layerId of layers) {
                // Check if it's a composition reference
                if (layerId.startsWith("compositionReference#")) {
                    try {
                        const referencedComp = api.getCompFromReference(layerId);
                        if (referencedComp && referencedComp.startsWith("compNode#")) {
                            compsToKeep.add(referencedComp);
                            checkCompReferences(referencedComp); // Recursive check
                        }
                    } catch (e) {}
                }
            }
            
            // Restore active comp
            api.setActiveComp(oldActive);
        } catch (e) {}
    }
    
    console.log("Processing selected compositions and their hierarchies...");
    for (let assetId of selectedAssets) {
        // Process the Assets Window hierarchy
        processAssetHierarchy(assetId);
        
        // Also check for composition references in Scene Window if it's a comp
        if (assetId.startsWith("compNode#")) {
            checkCompReferences(assetId);
        }
    }
    
    console.log(`Keeping ${compsToKeep.size} composition(s) and their dependencies.`);
    
    // Get all assets
    const allAssets = api.getAssetWindowLayers(false);
    console.log(`Total assets in project: ${allAssets.length}`);
    
    // Delete unused compositions
    let deleteCount = 0;
    let checkCount = 0;
    
    for (let item of allAssets) {
        if (item.startsWith("compNode#")) {
            checkCount++;
            if (!compsToKeep.has(item)) {
                try {
                    api.deleteLayer(item);
                    deleteCount++;
                } catch (e) {}
            }
        }
    }
    
    console.log(`\n✓ Complete!`);
    console.log(`Found ${checkCount} total compositions`);
    console.log(`Kept ${compsToKeep.size} composition(s)`);
    console.log(`Deleted ${deleteCount} unused composition(s)`);
}

// Run the script
deleteUnusedCompositions();


