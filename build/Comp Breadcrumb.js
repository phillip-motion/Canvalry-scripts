// src/Comp Breadcrumb.js
var GITHUB_REPO = "phillip-motion/Canvalry-scripts";
var scriptName = "Comp Breadcrumb";
var currentVersion = "1.0.0";
function compareVersions(v1, v2) {
  var parts1 = v1.split(".").map(function(n) {
    return parseInt(n, 10) || 0;
  });
  var parts2 = v2.split(".").map(function(n) {
    return parseInt(n, 10) || 0;
  });
  for (var i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    var num1 = parts1[i] || 0;
    var num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}
function checkForUpdate(githubRepo, scriptName2, currentVersion2, callback) {
  var now = (/* @__PURE__ */ new Date()).getTime();
  var oneDayAgo = now - 24 * 60 * 60 * 1e3;
  var shouldFetchFromGithub = true;
  var cachedLatestVersion = null;
  if (api.hasPreferenceObject(scriptName2 + "_update_check")) {
    var prefs = api.getPreferenceObject(scriptName2 + "_update_check");
    cachedLatestVersion = prefs.latestVersion;
    if (prefs.lastCheck && prefs.lastCheck > oneDayAgo) {
      shouldFetchFromGithub = false;
    }
  }
  if (!shouldFetchFromGithub && cachedLatestVersion) {
    var updateAvailable = compareVersions(cachedLatestVersion, currentVersion2) > 0;
    if (updateAvailable) {
      console.warn(scriptName2 + " " + cachedLatestVersion + " update available (you have " + currentVersion2 + "). Download at github.com/" + githubRepo);
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
      var latestVersion = versions[scriptName2];
      if (!latestVersion) {
        console.warn("Version check: Script name '" + scriptName2 + "' not found in versions.json");
        if (callback) callback(false);
        return;
      }
      if (latestVersion.indexOf && latestVersion.indexOf("v") === 0) {
        latestVersion = latestVersion.substring(1);
      }
      api.setPreferenceObject(scriptName2 + "_update_check", {
        lastCheck: (/* @__PURE__ */ new Date()).getTime(),
        latestVersion
      });
      var updateAvailable = compareVersions(latestVersion, currentVersion2) > 0;
      if (updateAvailable) {
        console.warn(scriptName2 + " " + latestVersion + " update available (you have " + currentVersion2 + "). Download at github.com/" + githubRepo);
        if (callback) callback(true, latestVersion);
      } else {
        if (callback) callback(false);
      }
    } else {
      console.log("Version check: Unable to fetch versions.json (HTTP " + client.status() + ")");
      if (callback) callback(false);
    }
  } catch (e) {
    console.log("Version check: Error - " + e.message);
    if (callback) callback(false);
  }
}
checkForUpdate(GITHUB_REPO, scriptName, currentVersion);
ui.setToolbar();
ui.setFixedHeight(32);
ui.setMargins(0, 0, 0, 0);
ui.setSpaceBetween(0);
var parentMap = {};
var visitHistory = [];
var building = false;
var navPath = [];
var activeIndex = -1;
var breadcrumbLayout = new ui.HLayout();
breadcrumbLayout.setMargins(4, 0, 4, 0);
breadcrumbLayout.setSpaceBetween(0);
var scrollView = new ui.ScrollView();
scrollView.setFixedHeight(28);
scrollView.setLayout(breadcrumbLayout);
ui.add(scrollView);
function buildParentMap() {
  if (building) return;
  building = true;
  try {
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
          } catch (e) {
          }
        }
      } catch (e) {
      }
    }
    if (savedComp) api.setActiveComp(savedComp);
  } finally {
    building = false;
  }
}
function recordVisit(compId) {
  if (!compId) return;
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
function getAncestorChain(compId) {
  if (!compId) return [];
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
function validateNavPath() {
  var activeComp = api.getActiveComp();
  if (!activeComp) {
    navPath = [];
    activeIndex = -1;
    return;
  }
  var allComps = api.getComps();
  navPath = navPath.filter(function(id) {
    return allComps.indexOf(id) !== -1;
  });
  for (var i = 1; i < navPath.length; i++) {
    var parents = parentMap[navPath[i]];
    if (!parents || parents.indexOf(navPath[i - 1]) === -1) {
      navPath.splice(i);
      break;
    }
  }
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
  if (!newComp) {
    navPath = [];
    activeIndex = -1;
    renderBreadcrumb();
    return;
  }
  recordVisit(newComp);
  var existingIdx = navPath.indexOf(newComp);
  if (existingIdx !== -1) {
    activeIndex = existingIdx;
    renderBreadcrumb();
    return;
  }
  if (activeIndex >= 0 && activeIndex < navPath.length) {
    var currentComp = navPath[activeIndex];
    var parents = parentMap[newComp];
    if (parents && parents.indexOf(currentComp) !== -1) {
      navPath.splice(activeIndex + 1);
      navPath.push(newComp);
      activeIndex = navPath.length - 1;
      renderBreadcrumb();
      return;
    }
  }
  navPath = getAncestorChain(newComp);
  activeIndex = navPath.length - 1;
  renderBreadcrumb();
}
var accentColor = ui.getThemeColor("Accent1");
var textColor = ui.getThemeColor("Text");
var midColor = ui.getThemeColor("Midlight");
var baseColor = ui.getThemeColor("Base");
function renderBreadcrumb() {
  breadcrumbLayout.clear();
  if (navPath.length === 0) {
    var emptyLabel = new ui.Label("No comp");
    emptyLabel.setTextColor(midColor);
    breadcrumbLayout.add(emptyLabel);
    breadcrumbLayout.addStretch();
    return;
  }
  for (var i = 0; i < navPath.length; i++) {
    if (i > 0) {
      var sep = new ui.Label("  >  ");
      sep.setTextColor(textColor);
      breadcrumbLayout.add(sep);
    }
    var compId = navPath[i];
    var isActive = i === activeIndex;
    var isForward = i > activeIndex;
    var hasMultipleParents = parentMap[compId] && parentMap[compId].length > 1;
    var name;
    try {
      name = api.getNiceName(compId);
    } catch (e) {
      name = "<deleted>";
    }
    var label = new ui.Label(name.replace(/ /g, "\xA0"));
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
      var indicator = new ui.Label(" \u25BE");
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
var popoverLayout = new ui.VLayout();
popoverLayout.setMargins(4, 4, 4, 4);
popoverLayout.setSpaceBetween(2);
var popover = new ui.Container();
popover.setLayout(popoverLayout);
popover.setRadius(4, 4, 4, 4);
function showParentMenu(compId, sourceContainer) {
  try {
    var parents = parentMap[compId];
    if (!parents || parents.length <= 1) return;
    popoverLayout.clear();
    for (var i = 0; i < parents.length; i++) {
      (function(pid) {
        var btnLabel;
        try {
          btnLabel = api.getNiceName(pid);
        } catch (e) {
          btnLabel = "<deleted>";
        }
        var btn = new ui.Button(btnLabel);
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
  } catch (e) {
    console.log("Comp Breadcrumb showParentMenu: " + e);
  }
}
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
    if (!comp) {
      renderBreadcrumb();
      return;
    }
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
try {
  buildParentMap();
  initComp = api.getActiveComp();
  if (!initComp) {
    navPath = [];
    activeIndex = -1;
  } else {
    recordVisit(initComp);
    navPath = getAncestorChain(initComp);
    activeIndex = navPath.length - 1;
  }
  renderBreadcrumb();
} catch (e) {
  console.log("Comp Breadcrumb init: " + e);
  navPath = [];
  activeIndex = -1;
  renderBreadcrumb();
}
var initComp;
ui.show();
