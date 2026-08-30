// Precompose Selected (Keep Timing)
// Wraps the current selection in a new Composition, then retimes it so the earliest selected
// layer starts at frame 0 inside the new Comp — nothing shifts in the parent Composition.
//
// Cavalry's own Pre-Compose leaves layers at their original absolute frame numbers (e.g. a layer
// trimmed to 20-70 stays at 20-70 inside the new Comp) and resets the new Pre-Comp layer's own
// clip to the full length of the active Composition. This script instead:
//   - shifts every selected layer's timing (in/out + keyframes) back to start at frame 0
//   - resizes the new Comp's own frame range to match that shifted duration
//   - shifts the Pre-Comp layer itself by the same amount, which re-syncs it to source from the
//     new Comp's frame 0 rather than the old absolute frame — then trims its clip back to exactly
//     where the selection used to sit in the parent

function precomposeKeepTiming() {
    const selection = api.getSelection();

    if (selection.length === 0) {
        console.warn("No layers selected. Select one or more layers in the Scene Window and try again.");
        return;
    }

    // Combined in/out range of the original selection, captured before it moves into the new Comp.
    // getOutFrame() is exclusive (one frame past the last visible frame) while setOutFrame() takes
    // the last inclusive frame, so the two need a -1 conversion when round-tripping a value.
    let minIn = Infinity;
    let maxOutExclusive = -Infinity;
    for (const id of selection) {
        minIn = Math.min(minIn, api.getInFrame(id));
        maxOutExclusive = Math.max(maxOutExclusive, api.getOutFrame(id));
    }
    const span = maxOutExclusive - minIn;

    const ref = api.preCompose();
    const childComp = api.getCompFromReference(ref);

    // Slide every layer (and its keyframes) back so the earliest one starts at frame 0, then
    // shrink the new Comp's frame range to match — this is what you see when you open it.
    for (const id of api.getChildren(childComp)) {
        api.offsetLayerTime(id, -minIn);
    }
    api.set(childComp, { startFrame: 0, endFrame: span - 1 });

    // Shifting the Pre-Comp layer itself by the same delta re-syncs it to the Comp's new frame 0,
    // then the clip is trimmed back to exactly where the selection originally sat in the parent.
    api.offsetLayerTime(ref, minIn);
    api.setInFrame(ref, minIn);
    api.setOutFrame(ref, maxOutExclusive - 1);

    console.log(`Pre-Composed ${selection.length} layer(s). Parent clip unchanged at frames ${minIn}-${maxOutExclusive - 1}; inside the Pre-Comp it now runs 0-${span - 1}.`);
}

precomposeKeepTiming();
