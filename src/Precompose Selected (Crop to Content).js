// Precompose Selected (Crop to Content)
// Like Composition > Pre-Compose based on Selection Bounds, but also retimes the selection so the
// earliest layer starts at frame 0 inside the new Comp (see the sibling "Precompose Selected (Keep
// Timing)" script for the full explanation) — nothing shifts in the parent Composition.
//
// The new Composition is sized to the selection's combined bounding box across its whole visible
// duration, its contents are re-centred inside it, and the Pre-Comp layer is repositioned in the
// active Composition so everything renders exactly where — and when — it did before.

function precomposeCropToContent() {
    const selection = api.getSelection();

    if (selection.length === 0) {
        console.warn("No layers selected. Select one or more layers in the Scene Window and try again.");
        return;
    }

    const originalFrame = api.getFrame();

    // Combined in/out range of the original selection (see the Keep Timing script for the
    // getOutFrame()/setOutFrame() off-by-one explanation).
    let minIn = Infinity;
    let maxOutExclusive = -Infinity;
    for (const id of selection) {
        minIn = Math.min(minIn, api.getInFrame(id));
        maxOutExclusive = Math.max(maxOutExclusive, api.getOutFrame(id));
    }
    const span = maxOutExclusive - minIn;

    // Combined bounding box across the whole selection. Each layer is sampled at every frame it is
    // visible for, not at one shared frame: bounding boxes are only valid while a layer is on, and
    // anything that animates would otherwise get cropped to wherever it happened to be sampled.
    let left = Infinity, right = -Infinity, top = -Infinity, bottom = Infinity;
    for (const id of selection) {
        const lastVisible = api.getOutFrame(id) - 1;
        for (let frame = api.getInFrame(id); frame <= lastVisible; frame++) {
            api.setFrame(frame);
            const bbox = api.getBoundingBox(id, true);
            if (bbox.width === 0 && bbox.height === 0) continue;
            left = Math.min(left, bbox.left);
            right = Math.max(right, bbox.right);
            top = Math.max(top, bbox.top);
            bottom = Math.min(bottom, bbox.bottom);
        }
    }
    api.setFrame(originalFrame);

    const width = Math.round(right - left);
    const height = Math.round(top - bottom);
    const centre = { x: (left + right) / 2, y: (top + bottom) / 2 };

    if (width <= 0 || height <= 0) {
        console.warn("Selected layers have no visible bounds to crop to.");
        return;
    }

    const ref = api.preCompose();
    const childComp = api.getCompFromReference(ref);
    api.set(childComp, { resolution: [width, height] });

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

    // Re-centre the content inside the now-cropped Composition by parenting it to one offset group,
    // then move the Pre-Comp layer to where that content used to be so nothing shifts in the parent.
    // The offset has to live on a group: writing to each layer's own position would lay a keyframe
    // at the playhead on anything already animated, wrecking the animation rather than moving it.
    const offsetGroup = api.create("group", "Crop Offset");
    api.parent(offsetGroup, childComp);
    for (const id of api.getChildren(childComp)) {
        if (id !== offsetGroup) {
            api.parent(id, offsetGroup);
        }
    }
    api.set(offsetGroup, { position: [-centre.x, -centre.y] });

    api.set(ref, { position: [centre.x, centre.y] });
    api.select([ref]);

    console.log(`Pre-Composed ${selection.length} layer(s) into a ${width}x${height} Composition. Parent clip unchanged at frames ${minIn}-${maxOutExclusive - 1}; inside the Pre-Comp it now runs 0-${span - 1}.`);
}

precomposeCropToContent();
