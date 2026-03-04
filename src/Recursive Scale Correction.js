// Recursive Scale Correction
// Recursively flattens all scale transforms in a selected hierarchy to 1x,
// propagating parent group scales into child positions, geometry, and filter
// pixel values so they remain visually correct when nested as a precomp.

// ---------------------------------------------------------------------------
// Configuration: known filter layer types and their pixel-value attributes
// ---------------------------------------------------------------------------
// Each entry maps a layerType prefix to an array of attribute descriptors.
//   kind: "double2" | "double"
//   attr: the attribute path (relative to the filter layer)
// Extend this map to support additional filter types.
const FILTER_ATTR_MAP = {
  blurFilter: [{ attr: "amount", kind: "double2_or_double" }],
  innerShadowFilter: [
    { attr: "offset", kind: "double2" },
    { attr: "amount", kind: "double2" },
    { attr: "spread", kind: "double" },
  ],
  dropShadowFilter: [
    { attr: "offset", kind: "double2" },
    { attr: "amount", kind: "double2" },
    { attr: "spread", kind: "double" },
  ],
};

// Geometry attributes to attempt baking scale into on leaf shapes.
const GEOMETRY_ATTRS = [
  { attr: "generator.dimensions", kind: "double2" },
  { attr: "generator.radius", kind: "double2_or_double" },
  { attr: "generator.innerRadius", kind: "double2_or_double" },
  { attr: "generator.size", kind: "double2_or_double" },
  { attr: "generator.width", kind: "double" },
  { attr: "generator.height", kind: "double" },
  { attr: "stroke.width", kind: "double" },
];

// ---------------------------------------------------------------------------
// Counters for summary
// ---------------------------------------------------------------------------
let stats = {
  layersScanned: 0,
  groupsFlattened: 0,
  leavesFlattened: 0,
  filtersAdjusted: 0,
  keyframesModified: 0,
  warnings: [],
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function geoMean(sx, sy) {
  return Math.sqrt(Math.abs(sx * sy));
}

function isFilterLayer(layerType) {
  for (const prefix in FILTER_ATTR_MAP) {
    if (layerType.indexOf(prefix) === 0) return true;
  }
  return false;
}

function getFilterPrefix(layerType) {
  for (const prefix in FILTER_ATTR_MAP) {
    if (layerType.indexOf(prefix) === 0) return prefix;
  }
  return null;
}

function warn(msg) {
  stats.warnings.push(msg);
  console.log("WARNING: " + msg);
}

// Returns true if a layer acts as a group (has at least one non-filter child).
// A shape with only filter children is still a leaf -- not a group.
function hasNonFilterChildren(layerId, infoMap) {
  var children = infoMap[layerId] ? infoMap[layerId].children : api.getChildren(layerId);
  for (var i = 0; i < children.length; i++) {
    var childInfo = infoMap[children[i]];
    if (childInfo && !childInfo.isFilter) return true;
    if (!childInfo) {
      // Not in info map yet; check type directly
      if (!isFilterLayer(api.getLayerType(children[i]))) return true;
    }
  }
  return false;
}

// Returns filter-layer children of a given layer.
function getFilterChildren(layerId, infoMap) {
  var result = [];
  var children = infoMap[layerId] ? infoMap[layerId].children : api.getChildren(layerId);
  for (var i = 0; i < children.length; i++) {
    var childInfo = infoMap[children[i]];
    if (childInfo && childInfo.isFilter) {
      result.push(children[i]);
    } else if (!childInfo && isFilterLayer(api.getLayerType(children[i]))) {
      result.push(children[i]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pass 1 – Collect hierarchy info (read-only)
// ---------------------------------------------------------------------------
// Returns a map: layerId -> { scaleX, scaleY, accScaleX, accScaleY,
//   layerType, children, isFilter, name }
function collectHierarchyInfo(rootIds) {
  const info = {};

  function walk(layerId, parentAccX, parentAccY) {
    if (info[layerId]) return; // already visited

    stats.layersScanned++;

    const layerType = api.getLayerType(layerId);
    const name = api.getNiceName(layerId);

    let scaleX = 1;
    let scaleY = 1;
    if (api.hasAttribute(layerId, "scale.x")) {
      scaleX = Number(api.get(layerId, "scale.x"));
    }
    if (api.hasAttribute(layerId, "scale.y")) {
      scaleY = Number(api.get(layerId, "scale.y"));
    }

    const accX = parentAccX * scaleX;
    const accY = parentAccY * scaleY;

    const children = api.getChildren(layerId);
    const filter = isFilterLayer(layerType);

    // Check for animated scale and warn
    let scaleAnimated = false;
    if (api.hasAttribute(layerId, "scale.x") && api.isAnimatedAttribute(layerId, "scale.x")) {
      scaleAnimated = true;
    }
    if (api.hasAttribute(layerId, "scale.y") && api.isAnimatedAttribute(layerId, "scale.y")) {
      scaleAnimated = true;
    }
    if (scaleAnimated) {
      warn(
        name +
          " (" +
          layerId +
          ") has animated scale. Using current frame value (" +
          scaleX.toFixed(2) +
          ", " +
          scaleY.toFixed(2) +
          ")."
      );
    }

    info[layerId] = {
      scaleX: scaleX,
      scaleY: scaleY,
      accScaleX: accX,
      accScaleY: accY,
      layerType: layerType,
      children: children,
      isFilter: filter,
      name: name,
      scaleAnimated: scaleAnimated,
    };

    for (var i = 0; i < children.length; i++) {
      walk(children[i], accX, accY);
    }
  }

  for (var i = 0; i < rootIds.length; i++) {
    walk(rootIds[i], 1, 1);
  }
  return info;
}

// ---------------------------------------------------------------------------
// Animated value helpers
// ---------------------------------------------------------------------------

// Scale a single numeric attribute (double) by a factor, handling keyframes.
// For animated attributes we move the playhead to each keyframe time, read the
// value at that frame, multiply, then write back via modifyKeyframe.
function scaleDoubleAttr(layerId, attrPath, factor) {
  if (Math.abs(factor - 1) < 0.0001) return;
  if (!api.hasAttribute(layerId, attrPath)) return;

  if (api.isAnimatedAttribute(layerId, attrPath)) {
    var currentFrame = api.getFrame();
    var times = api.getKeyframeTimes(layerId, attrPath);
    for (var i = 0; i < times.length; i++) {
      api.setFrame(times[i]);
      var val = Number(api.get(layerId, attrPath));
      // @ts-ignore – modifyKeyframe accepts nested {attrPath: {frame, newValue}} per API examples
      api.modifyKeyframe(layerId, {
        [attrPath]: { frame: times[i], newValue: val * factor },
      });
      stats.keyframesModified++;
    }
    api.setFrame(currentFrame);
  } else {
    var val = Number(api.get(layerId, attrPath));
    api.set(layerId, { [attrPath]: val * factor });
  }
}

// Scale a double2 attribute (x and y components) by (factorX, factorY),
// handling keyframes on each axis independently.
function scaleDouble2Attr(layerId, attrPath, factorX, factorY) {
  scaleDoubleAttr(layerId, attrPath + ".x", factorX);
  scaleDoubleAttr(layerId, attrPath + ".y", factorY);
}

// Scale an attribute that might be double2 or double, probing with hasAttribute.
function scaleAutoAttr(layerId, attrPath, sx, sy, kind) {
  if (!api.hasAttribute(layerId, attrPath)) return;

  // For single-value attributes with non-uniform scale, warn about approximation
  var needsGeoMean = false;

  if (kind === "double2") {
    scaleDouble2Attr(layerId, attrPath, sx, sy);
  } else if (kind === "double") {
    needsGeoMean = true;
    scaleDoubleAttr(layerId, attrPath, geoMean(sx, sy));
  } else if (kind === "double2_or_double") {
    if (api.hasAttribute(layerId, attrPath + ".x")) {
      scaleDouble2Attr(layerId, attrPath, sx, sy);
    } else {
      needsGeoMean = true;
      scaleDoubleAttr(layerId, attrPath, geoMean(sx, sy));
    }
  }

  if (needsGeoMean && Math.abs(sx - sy) > 0.01) {
    warn(
      "Non-uniform scale (" +
        sx.toFixed(3) +
        ", " +
        sy.toFixed(3) +
        ") applied to single-value attribute " +
        attrPath +
        " on " +
        layerId +
        ". Using geometric mean " +
        geoMean(sx, sy).toFixed(3) +
        " as approximation."
    );
  }
}

// ---------------------------------------------------------------------------
// Filter value adjustment
// ---------------------------------------------------------------------------
function adjustFilterValues(layerId, layerType, sx, sy) {
  var prefix = getFilterPrefix(layerType);
  if (!prefix) {
    warn(
      "Unknown filter type: " +
        layerType +
        " on " +
        layerId +
        ". Attributes: " +
        JSON.stringify(api.getAttributes(layerId))
    );
    return;
  }

  var descriptors = FILTER_ATTR_MAP[prefix];
  for (var i = 0; i < descriptors.length; i++) {
    var desc = descriptors[i];
    scaleAutoAttr(layerId, desc.attr, sx, sy, desc.kind);
  }

  stats.filtersAdjusted++;
  console.log(
    "  Filter adjusted: " +
      api.getNiceName(layerId) +
      " (" +
      layerId +
      ") by (" +
      sx.toFixed(3) +
      ", " +
      sy.toFixed(3) +
      ")"
  );
}

// ---------------------------------------------------------------------------
// Geometry baking for leaf shapes
// ---------------------------------------------------------------------------
function bakeScaleIntoGeometry(layerId, sx, sy, info) {
  var baked = false;

  for (var i = 0; i < GEOMETRY_ATTRS.length; i++) {
    var ga = GEOMETRY_ATTRS[i];
    if (api.hasAttribute(layerId, ga.attr)) {
      scaleAutoAttr(layerId, ga.attr, sx, sy, ga.kind);
      baked = true;
    }
  }

  if (!baked && (Math.abs(sx - 1) > 0.0001 || Math.abs(sy - 1) > 0.0001)) {
    warn(
      "Could not bake geometry for " +
        info.name +
        " (" +
        layerId +
        ", type: " +
        info.layerType +
        "). No recognized geometry attributes found. Scale (" +
        sx.toFixed(3) +
        ", " +
        sy.toFixed(3) +
        ") will be left on this layer."
    );
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pass 2 – Flatten hierarchy (top-down, mutating)
// ---------------------------------------------------------------------------
function flattenHierarchy(rootIds, infoMap) {
  // Determine whether a layer should be treated as a group or leaf.
  // A layer is a "group" if it has at least one non-filter child.
  // A layer with only filter children is a "leaf with filters."
  function isGroup(layerId) {
    return hasNonFilterChildren(layerId, infoMap);
  }

  function processGroup(layerId) {
    var info = infoMap[layerId];
    if (!info) return;

    var sx = info.scaleX;
    var sy = info.scaleY;

    // Skip if already at 1x, but still recurse into children
    if (Math.abs(sx - 1) < 0.0001 && Math.abs(sy - 1) < 0.0001) {
      for (var i = 0; i < info.children.length; i++) {
        var child = info.children[i];
        var childInfo = infoMap[child];
        if (!childInfo || childInfo.isFilter) continue;
        if (isGroup(child)) {
          processGroup(child);
        } else {
          processLeaf(child);
        }
      }
      return;
    }

    console.log(
      "Flattening group: " +
        info.name +
        " (" +
        layerId +
        ") scale (" +
        sx.toFixed(3) +
        ", " +
        sy.toFixed(3) +
        ")"
    );

    // Process each child: adjust position and propagate scale
    for (var i = 0; i < info.children.length; i++) {
      var child = info.children[i];
      var childInfo = infoMap[child];
      if (!childInfo) continue;

      // 1. Scale the child's position to compensate for parent scale removal
      if (api.hasAttribute(child, "position.x")) {
        scaleDoubleAttr(child, "position.x", sx);
      }
      if (api.hasAttribute(child, "position.y")) {
        scaleDoubleAttr(child, "position.y", sy);
      }

      if (childInfo.isFilter) {
        // 2a. Filter child of the group: adjust pixel values
        adjustFilterValues(child, childInfo.layerType, sx, sy);
      } else if (isGroup(child)) {
        // 2b. Child is a group: multiply its scale to carry our scale forward
        if (api.hasAttribute(child, "scale.x")) {
          var childSx = Number(api.get(child, "scale.x"));
          var childSy = Number(api.get(child, "scale.y"));
          api.set(child, {
            "scale.x": childSx * sx,
            "scale.y": childSy * sy,
          });
          childInfo.scaleX = childSx * sx;
          childInfo.scaleY = childSy * sy;
        }
      } else {
        // 2c. Leaf shape (may have filter-only children): bake parent scale
        bakeScaleIntoGeometry(child, sx, sy, childInfo);

        // Adjust filter children of this leaf
        var filterKids = getFilterChildren(child, infoMap);
        for (var j = 0; j < filterKids.length; j++) {
          var fkInfo = infoMap[filterKids[j]];
          if (fkInfo) {
            adjustFilterValues(filterKids[j], fkInfo.layerType, sx, sy);
          }
        }
      }
    }

    // 3. Reset this group's scale to 1
    api.set(layerId, { "scale.x": 1, "scale.y": 1 });
    stats.groupsFlattened++;

    // 4. Recurse into child groups / leaves (scales have been propagated)
    for (var i = 0; i < info.children.length; i++) {
      var child = info.children[i];
      var childInfo = infoMap[child];
      if (!childInfo || childInfo.isFilter) continue;

      if (isGroup(child)) {
        processGroup(child);
      } else {
        processLeaf(child);
      }
    }
  }

  function processLeaf(layerId) {
    var info = infoMap[layerId];
    if (!info || info.isFilter) return;

    // Re-read scale in case parent propagation changed it
    var sx = 1;
    var sy = 1;
    if (api.hasAttribute(layerId, "scale.x")) {
      sx = Number(api.get(layerId, "scale.x"));
      sy = Number(api.get(layerId, "scale.y"));
    }

    if (Math.abs(sx - 1) < 0.0001 && Math.abs(sy - 1) < 0.0001) return;

    console.log(
      "  Flattening leaf: " +
        info.name +
        " (" +
        layerId +
        ") scale (" +
        sx.toFixed(3) +
        ", " +
        sy.toFixed(3) +
        ")"
    );

    // Bake own scale into geometry
    var geoBaked = bakeScaleIntoGeometry(layerId, sx, sy, info);

    // Adjust filter children of this leaf by its own scale
    var filterKids = getFilterChildren(layerId, infoMap);
    for (var i = 0; i < filterKids.length; i++) {
      var fkType = api.getLayerType(filterKids[i]);
      adjustFilterValues(filterKids[i], fkType, sx, sy);
    }

    // Reset scale to 1 only if geometry was successfully baked
    if (geoBaked) {
      api.set(layerId, { "scale.x": 1, "scale.y": 1 });
      stats.leavesFlattened++;
    }
  }

  // Kick off from each root
  for (var i = 0; i < rootIds.length; i++) {
    var rootInfo = infoMap[rootIds[i]];
    if (!rootInfo) continue;

    if (isGroup(rootIds[i])) {
      processGroup(rootIds[i]);
    } else {
      processLeaf(rootIds[i]);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
(function main() {
  var sel = api.getSelection();

  if (sel.length === 0) {
    console.log("Recursive Scale Correction: No layers selected. Select one or more layers/groups to flatten.");
    return;
  }

  console.log("=== Recursive Scale Correction ===");
  console.log("Selected " + sel.length + " root layer(s).");

  // Warn about composition references
  for (var i = 0; i < sel.length; i++) {
    var lt = api.getLayerType(sel[i]);
    if (lt === "compositionReference") {
      warn(
        api.getNiceName(sel[i]) +
          " is a Composition Reference. The script will flatten transforms within this comp's hierarchy but will NOT enter the referenced composition. To flatten inside the precomp, open it and run the script there."
      );
    }
  }

  // Pass 1: collect
  console.log("\n--- Pass 1: Collecting hierarchy info ---");
  var infoMap = collectHierarchyInfo(sel);
  console.log("Scanned " + stats.layersScanned + " layers.");

  // Pass 2: flatten
  console.log("\n--- Pass 2: Flattening scales ---");
  flattenHierarchy(sel, infoMap);

  // Summary
  console.log("\n=== Summary ===");
  console.log("Layers scanned:     " + stats.layersScanned);
  console.log("Groups flattened:   " + stats.groupsFlattened);
  console.log("Leaves flattened:   " + stats.leavesFlattened);
  console.log("Filters adjusted:   " + stats.filtersAdjusted);
  console.log("Keyframes modified: " + stats.keyframesModified);

  if (stats.warnings.length > 0) {
    console.log("\nWarnings (" + stats.warnings.length + "):");
    for (var i = 0; i < stats.warnings.length; i++) {
      console.log("  - " + stats.warnings[i]);
    }
  }

  console.log("\nDone.");
})();
