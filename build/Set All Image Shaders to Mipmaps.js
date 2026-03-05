// src/Set All Image Shaders to Mipmaps.js
var allLayers = api.getAllSceneLayers();
var imageShaderCount = 0;
var updatedCount = 0;
console.log("Scanning " + allLayers.length + " layers...");
for (i = 0; i < allLayers.length; i++) {
  layerId = allLayers[i];
  layerType = api.getLayerType(layerId);
  if (layerType === "imageShader") {
    imageShaderCount++;
    layerName = api.getNiceName(layerId);
    console.log("Found Image Shader: " + layerName);
    try {
      api.set(layerId, { "filterQuality": 2 });
      updatedCount++;
      console.log("\u2713 Updated " + layerName + " to use Mipmaps filtering");
    } catch (error) {
      console.log("\u2717 Failed to update " + layerName + ": " + error);
      console.log("\u2192 Try right-clicking the Filter attribute and copying the scripting path");
    }
  }
}
var layerId;
var layerType;
var layerName;
var i;
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
