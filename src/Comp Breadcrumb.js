// Comp Breadcrumb Toolbar for Cavalry
// Dockable toolbar showing parent composition hierarchy with click-to-navigate

ui.setToolbar();
ui.setFixedHeight(32);
ui.setMargins(0, 0, 0, 0);
ui.setSpaceBetween(0);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

var parentMap = {};    // childCompId -> [parentCompId, ...]
var visitHistory = []; // comp IDs in order visited, most recent last
var building = false;  // re-entry guard for buildParentMap
var navPath = [];      // ordered comp IDs representing the full breadcrumb trail
var activeIndex = -1;  // index of the currently active comp in navPath

var breadcrumbLayout = new ui.HLayout();
breadcrumbLayout.setMargins(4, 0, 4, 0);
breadcrumbLayout.setSpaceBetween(0);

var scrollView = new ui.ScrollView();
scrollView.setFixedHeight(28);
scrollView.setLayout(breadcrumbLayout);

ui.add(scrollView);

// ---------------------------------------------------------------------------
// Parent map — maps each comp to the comps that contain it as a precomp
// ---------------------------------------------------------------------------

function buildParentMap() {
    building = true;
    parentMap = {};
    var allComps = api.getComps();
    var savedComp = api.getActiveComp();

    for (var i = 0; i < allComps.length; i++) {
        var comp = allComps[i];
        try {
            api.setActiveComp(comp);
            var refs = api.getCompLayersOfType(false, "compositionReference");
            for (var r = 0; r < refs.length; r++) {
                try {
                    var childComp = api.getCompFromReference(refs[r]);
                    if (childComp) {
                        if (!parentMap[childComp]) parentMap[childComp] = [];
                        if (parentMap[childComp].indexOf(comp) === -1) {
                            parentMap[childComp].push(comp);
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }

    api.setActiveComp(savedComp);
    building = false;
}

// ---------------------------------------------------------------------------
// Visit history — used to disambiguate when a comp has multiple parents
// ---------------------------------------------------------------------------

function recordVisit(compId) {
    var idx = visitHistory.indexOf(compId);
    if (idx !== -1) visitHistory.splice(idx, 1);
    visitHistory.push(compId);
}

function pickParent(compId) {
    var parents = parentMap[compId];
    if (!parents || parents.length === 0) return null;
    if (parents.length === 1) return parents[0];

    var best = null;
    var bestIdx = -1;
    for (var i = 0; i < parents.length; i++) {
        var vi = visitHistory.indexOf(parents[i]);
        if (vi > bestIdx) {
            bestIdx = vi;
            best = parents[i];
        }
    }
    return best !== null ? best : parents[0];
}

// ---------------------------------------------------------------------------
// Ancestor chain — walk up parent map to build a path from root to comp
// Used for initial load and when navigating to an unrelated comp
// ---------------------------------------------------------------------------

function getAncestorChain(compId) {
    var chain = [compId];
    var visited = {};
    visited[compId] = true;
    var current = compId;

    while (true) {
        var parent = pickParent(current);
        if (!parent || visited[parent]) break;
        chain.unshift(parent);
        visited[parent] = true;
        current = parent;
    }
    return chain;
}

// ---------------------------------------------------------------------------
// Nav path management — preserves forward elements when clicking back
// ---------------------------------------------------------------------------

function validateNavPath() {
    // Check each consecutive parent-child link; truncate at first broken one
    for (var i = 1; i < navPath.length; i++) {
        var parents = parentMap[navPath[i]];
        if (!parents || parents.indexOf(navPath[i - 1]) === -1) {
            navPath.splice(i);
            break;
        }
    }

    // Make sure the active comp is still in the path
    var activeComp = api.getActiveComp();
    var idx = navPath.indexOf(activeComp);
    if (idx === -1) {
        navPath = getAncestorChain(activeComp);
        activeIndex = navPath.length - 1;
    } else {
        activeIndex = idx;
    }
}

function handleCompChanged() {
    var newComp = api.getActiveComp();
    recordVisit(newComp);

    // Already in navPath? Just move the cursor (preserves forward elements)
    var existingIdx = navPath.indexOf(newComp);
    if (existingIdx !== -1) {
        activeIndex = existingIdx;
        renderBreadcrumb();
        return;
    }

    // Drill-down from current position?
    // True when the current active comp is a parent of the new comp.
    if (activeIndex >= 0 && activeIndex < navPath.length) {
        var currentComp = navPath[activeIndex];
        var parents = parentMap[newComp];
        if (parents && parents.indexOf(currentComp) !== -1) {
            // Truncate any stale forward path, append the new child
            navPath.splice(activeIndex + 1);
            navPath.push(newComp);
            activeIndex = navPath.length - 1;
            renderBreadcrumb();
            return;
        }
    }

    // Unrelated navigation (e.g. opened from Assets window) — rebuild
    navPath = getAncestorChain(newComp);
    activeIndex = navPath.length - 1;
    renderBreadcrumb();
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

var accentColor = ui.getThemeColor("Accent1");
var textColor = ui.getThemeColor("Text");
var midColor = ui.getThemeColor("Midlight");
var baseColor = ui.getThemeColor("Base");

// ---------------------------------------------------------------------------
// Breadcrumb rendering
// ---------------------------------------------------------------------------

function renderBreadcrumb() {
    breadcrumbLayout.clear();

    for (var i = 0; i < navPath.length; i++) {
        if (i > 0) {
            var sep = new ui.Label("  >  ");
            sep.setTextColor(textColor);
            breadcrumbLayout.add(sep);
        }

        var compId = navPath[i];
        var isActive = (i === activeIndex);
        var isForward = (i > activeIndex);
        var hasMultipleParents = parentMap[compId] && parentMap[compId].length > 1;

        var name = api.getNiceName(compId);
        var label = new ui.Label(name.replace(/ /g, "\u00A0"));
        label.setToolTip(name);
        if (isActive) {
            label.setTextColor(accentColor);
        } else if (isForward) {
            label.setTextColor(midColor);
        } else {
            label.setTextColor(textColor);
        }

        var btnLayout = new ui.HLayout();
        btnLayout.setMargins(6, 2, 6, 2);
        btnLayout.setSpaceBetween(0);
        btnLayout.add(label);

        if (hasMultipleParents) {
            var indicator = new ui.Label(" ▾");
            indicator.setTextColor(midColor);
            btnLayout.add(indicator);
        }

        var container = new ui.Container();
        container.setLayout(btnLayout);
        container.setRadius(3, 3, 3, 3);

        if (isActive) {
            container.setBackgroundColor(baseColor);
        }

        (function(cid, cont, hasMulti, active) {
            cont.onMousePress = function(position, button) {
                if (button === "left" && !active) {
                    api.setActiveComp(cid);
                } else if (button === "right" && hasMulti) {
                    showParentMenu(cid, cont);
                }
            };
        })(compId, container, hasMultipleParents, isActive);

        breadcrumbLayout.add(container);
    }

    breadcrumbLayout.addStretch();
}

// ---------------------------------------------------------------------------
// Popover for segments with multiple parents
// ---------------------------------------------------------------------------

var popoverLayout = new ui.VLayout();
popoverLayout.setMargins(4, 4, 4, 4);
popoverLayout.setSpaceBetween(2);

var popover = new ui.Container();
popover.setLayout(popoverLayout);
popover.setRadius(4, 4, 4, 4);

function showParentMenu(compId, sourceContainer) {
    var parents = parentMap[compId];
    if (!parents || parents.length <= 1) return;

    popoverLayout.clear();

    for (var i = 0; i < parents.length; i++) {
        (function(pid) {
            var btn = new ui.Button(api.getNiceName(pid));
            btn.onClick = function() {
                popover.close();
                api.setActiveComp(pid);
            };
            popoverLayout.add(btn);
        })(parents[i]);
    }

    var geo = sourceContainer.geometry();
    popover.setPreferredPopoverSide(0);
    popover.showAsPopover(geo.left, geo.bottom);
}

// ---------------------------------------------------------------------------
// Callbacks — tightly scoped
// ---------------------------------------------------------------------------

function Callbacks() {
    this.onCompChanged = function() {
        if (building) return;
        handleCompChanged();
    };

    this.onSceneChanged = function() {
        visitHistory = [];
        navPath = [];
        activeIndex = -1;
        buildParentMap();
        var comp = api.getActiveComp();
        recordVisit(comp);
        navPath = getAncestorChain(comp);
        activeIndex = navPath.length - 1;
        renderBreadcrumb();
    };

    this.onAttrChanged = function(layerId, attrId) {
        if (attrId !== "niceName") return;
        if (navPath.indexOf(layerId) === -1) return;
        renderBreadcrumb();
    };

    this.onLayerAdded = function(layerId) {
        if (!layerId.startsWith("compositionReference#")) return;
        buildParentMap();
        validateNavPath();
        renderBreadcrumb();
    };

    this.onLayerRemoved = function(layerId) {
        if (!layerId.startsWith("compositionReference#")) return;
        buildParentMap();
        validateNavPath();
        renderBreadcrumb();
    };
}

ui.addCallbackObject(new Callbacks());

// ---------------------------------------------------------------------------
// Initial setup
// ---------------------------------------------------------------------------

buildParentMap();
var initComp = api.getActiveComp();
recordVisit(initComp);
navPath = getAncestorChain(initComp);
activeIndex = navPath.length - 1;
renderBreadcrumb();

ui.show();
