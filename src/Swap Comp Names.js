var selection = api.getSelection();

if (selection.length !== 2) {
    console.warn("Select exactly 2 comps to swap their names (" + selection.length + " selected).");
} else {
    var nameA = api.getNiceName(selection[0]);
    var nameB = api.getNiceName(selection[1]);

    api.rename(selection[0], nameB);
    api.rename(selection[1], nameA);

    console.log("Swapped names: \"" + nameA + "\" ↔ \"" + nameB + "\"");
}
