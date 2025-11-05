// Script to set all Image Shaders to Mipmaps filtering
var allLayers = api.getAllSceneLayers();
var imageShaderCount = 0;
var updatedCount = 0;

console.log("Scanning " + allLayers.length + " layers...");

for (var i = 0; i < allLayers.length; i++) {
    var layerId = allLayers[i];
    var layerType = api.getLayerType(layerId);
    
    if (layerType === "imageShader") {
        imageShaderCount++;
        var layerName = api.getNiceName(layerId);
        console.log("Found Image Shader: " + layerName);
        
        try {
            // Set the filter to Mipmaps (3rd option, index 2)
            api.set(layerId, { "filterQuality": 2 });
            updatedCount++;
            console.log("✓ Updated " + layerName + " to use Mipmaps filtering");
        } catch (error) {
            console.log("✗ Failed to update " + layerName + ": " + error);
            console.log("→ Try right-clicking the Filter attribute and copying the scripting path");
        }
    }
}

console.log("\n=== Summary ===");
console.log("Image Shaders found: " + imageShaderCount);
console.log("Successfully updated: " + updatedCount);

if (imageShaderCount === 0) {
    console.log("No Image Shaders found in the scene.");
} else if (updatedCount < imageShaderCount) {
    console.log("\nIf some updates failed, the filter attribute path might be different.");
    console.log("Right-click on an Image Shader's Filter attribute and select 'Copy Scripting Path'");
    console.log("to get the exact attribute name, then update the script accordingly.");
}