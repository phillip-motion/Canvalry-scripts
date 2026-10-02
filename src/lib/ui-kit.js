// Shared panel kit: theme tokens, labels, buttons, recessed fields, a segmented
// tab strip and list rows. Lives in src/lib so the bundler inlines it into each
// script rather than building it as a script of its own.
//
// Colours come from Cavalry's theme so the panels follow a theme change. Call
// tokens() when a panel is built rather than caching across runs.

function themeColor(name, fallback) {
    try {
        var color = ui.getThemeColor(name);
        return (typeof color === "string" && color.charAt(0) === "#") ? color : fallback;
    } catch (e) {
        return fallback;
    }
}

/**
 * Mix two hex colours. Any alpha byte on the inputs is ignored.
 * @param {string} fromHex
 * @param {string} toHex
 * @param {number} t - 0 returns fromHex, 1 returns toHex
 * @returns {string} 6-digit hex string
 */
export function blend(fromHex, toHex, t) {
    var ch = function (hex, i) { return parseInt(String(hex).replace("#", "").substr(i * 2, 2), 16); };
    var amount = Math.max(0, Math.min(1, t));
    var out = "#";
    for (var i = 0; i < 3; i++) {
        var v = Math.max(0, Math.min(255, Math.round(ch(fromHex, i) + (ch(toHex, i) - ch(fromHex, i)) * amount)));
        out += (v < 16 ? "0" : "") + v.toString(16);
    }
    return out;
}

/** @returns {Object} colour role -> hex string */
export function tokens() {
    var bg = themeColor("Base", "#373737");
    var text = themeColor("Text", "#f1f1f1");
    var accent = themeColor("Accent1", "#3ddc84");
    return {
        bg: bg,
        text: text,
        accent: accent,
        // Recessed controls sit sunk into the window, so this must be reliably darker.
        surface: blend(bg, "#000000", 0.28),
        // Raised above the window: tab trough, secondary buttons.
        raised: blend(bg, "#ffffff", 0.06),
        hover: blend(bg, text, 0.08),
        selected: blend(bg, accent, 0.22),
        primary: blend(bg, accent, 0.55),
        // Faded from Text rather than a theme swatch, so it never matches its background.
        muted: blend(text, bg, 0.45),
        warn: "#e8a33d",
        error: "#ff6666"
    };
}

export function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * One styled run of rich text. Qt renders a subset of HTML/CSS in labels.
 * @param {string} text - Plain text, escaped here
 * @param {Object} style - CSS properties, e.g. {"font-weight": 500, color: "#fff"}
 * @returns {string} HTML fragment
 */
export function span(text, style) {
    var css = [];
    for (var key in style) {
        if (style[key] !== undefined && style[key] !== null) css.push(key + ":" + style[key]);
    }
    // Non-breaking spaces keep Qt from wrapping or collapsing runs of spaces.
    return "<span style=\"" + css.join(";") + "\">" + escapeHtml(text).replace(/ /g, "&nbsp;") + "</span>";
}

// Non-breaking spaces stop Qt wrapping a short label onto two lines.
function nowrap(text) {
    return String(text).split(" ").join("\u00A0");
}

export function label(text, size, color) {
    var l = new ui.Label(text);
    l.setFontSize(size || 12);
    if (color) l.setTextColor(color);
    l.setTransparentForMouseEvents(true);
    return l;
}

/** A label built from rich-text spans; set its text with span() fragments. */
export function richLabel(html) {
    var l = new ui.Label(html || "");
    l.setTransparentForMouseEvents(true);
    return l;
}

export function heading(text, T) {
    return richLabel(span(text, { "font-size": "13px", "font-weight": 500, color: T.text }));
}

export function section(text, T) {
    return richLabel(span(text.toUpperCase(), { "font-size": "10px", "font-weight": 600, "letter-spacing": "0.5px", color: T.muted }));
}

/**
 * A status line under the controls. set(message, tone) with tone
 * "muted" (default), "ok", "warn" or "error".
 */
export function status(text, T) {
    var l = label(text || "", 11, T.muted);
    l.set = function (message, tone) {
        l.setTextColor(tone === "ok" ? T.accent : tone === "warn" ? T.warn : tone === "error" ? T.error : T.muted);
        l.setText(message);
    };
    return l;
}

/**
 * A real ui.Button: long work run from a Container's mouse handler has crashed
 * Cavalry, so actions stay on onClick. Styled with what Button allows.
 */
export function button(text, primary, T) {
    var b = new ui.Button(text);
    b.setFontSize(12);
    b.setFixedHeight(26);
    b.setDrawStroke(false);
    b.setCornerRounding(4);
    b.setBackgroundColor(primary ? T.primary : T.raised);
    return b;
}

/**
 * Sink a LineEdit or MultiLineEdit into a rounded surface. DropDowns stay
 * unwrapped: their native frame reads as a border inside the box. The
 * widget's own Qt frame cannot be removed, so it takes the surface colour and
 * blends into the container, reading as one recessed control.
 * @param {Object} widget
 * @param {number} [height] - Fixed height; omit for multi-line fields
 * @returns {Object} A ui.Container
 */
export function field(widget, T, height) {
    // Not every input widget exposes setBackgroundColor (DropDown may not)
    if (widget.setBackgroundColor) widget.setBackgroundColor(T.surface);
    if (widget.setTextColor) widget.setTextColor(T.text);
    if (widget.setFontSize) widget.setFontSize(12);

    var row = new ui.HLayout();
    row.setMargins(3, 3, 3, 3);
    row.setSpaceBetween(0);
    row.add(widget);

    var box = new ui.Container();
    box.setBackgroundColor(T.surface);
    box.setRadius(4, 4, 4, 4);
    if (height !== 0) box.setFixedHeight(height || 28);
    box.setLayout(row);
    return box;
}

/** A label and a control on one line, the label at a fixed width so rows align. */
export function formRow(text, control, T, labelWidth) {
    var row = new ui.HLayout();
    row.setSpaceBetween(8);
    var l = label(nowrap(text), 12, T.muted);
    l.setFixedWidth(labelWidth || 70);
    row.add(l);
    row.add(control);
    return row;
}

/** A checkbox with its label, matching formRow's text styling. */
export function checkRow(checkbox, text, T) {
    var row = new ui.HLayout();
    row.setSpaceBetween(6);
    row.add(checkbox);
    row.add(label(nowrap(text), 12, T.text));
    row.addStretch();
    return row;
}

/**
 * Segmented tab strip built from ui.Container: ui.TabView exposes no styling
 * and ui.Button has no selected state. Each tab shows or hides its page.
 * @param {Array<string>} labels
 * @param {Array<Object>} pages - One widget or layout per tab, added by the caller
 * @param {Function} [onSelect] - Called with the new index
 * @returns {Object} {widget, current(), select(index)}
 */
export function tabStrip(labels, pages, T, onSelect) {
    var hoverBackground = blend(T.raised, T.surface, 0.5);
    var row = new ui.HLayout();
    row.setSpaceBetween(2);
    row.setMargins(3, 3, 3, 3);

    var entries = [];
    var selected = 0;

    function paint(i) {
        var e = entries[i];
        var on = i === selected;
        e.box.setBackgroundColor(on ? T.surface : (e.hovered ? hoverBackground : T.raised));
        e.label.setTextColor(on ? T.text : T.muted);
    }

    function select(index) {
        selected = index;
        for (var i = 0; i < entries.length; i++) {
            paint(i);
            if (pages && pages[i]) pages[i].setHidden(i !== selected);
        }
    }

    labels.forEach(function (text, index) {
        var l = label(text, 12);
        var content = new ui.HLayout();
        content.setMargins(0, 0, 0, 0);
        content.addStretch();
        content.add(l);
        content.addStretch();

        var box = new ui.Container();
        box.setRadius(3, 3, 3, 3);
        box.setFixedHeight(25);
        box.setLayout(content);
        box.useHoverEvents(true);

        var entry = { box: box, label: l, hovered: false };
        entries.push(entry);

        // Tab clicks only toggle visibility, so a Container handler is safe here.
        box.onMousePress = function () {
            if (index === selected) return;
            select(index);
            if (onSelect) onSelect(index);
        };
        box.onMouseEnter = function () { entry.hovered = true; paint(index); };
        box.onMouseLeave = function () { entry.hovered = false; paint(index); };

        row.add(box);
    });

    var strip = new ui.Container();
    strip.setBackgroundColor(T.raised);
    strip.setRadius(5, 5, 5, 5);
    strip.setFixedHeight(31);
    strip.setLayout(row);

    select(0);

    return {
        widget: strip,
        current: function () { return selected; },
        select: select
    };
}

/**
 * A scrolling list. Add rows to .layout; .clear() empties it. The rows carry
 * the surface colour: ScrollView has no setBackgroundColor, and wrapping it in
 * a Container stops it rendering.
 */
export function list(height, T) {
    var layout = new ui.VLayout();
    layout.setMargins(4, 4, 4, 4);
    layout.setSpaceBetween(2);
    var scroll = new ui.ScrollView();
    scroll.setLayout(layout);
    if (height) scroll.setFixedHeight(height);
    return { widget: scroll, layout: layout };
}

/**
 * A list row: a rich-text title with an optional muted detail line, hover
 * highlight, and an optional leading widget (e.g. a Checkbox).
 * @param {string} titleHtml - Built with span()
 * @param {string} [detail] - Plain text
 * @param {Object} [opts] - {lead: widget, tip: string, detailHtml: string}
 * @returns {Object} A ui.Container
 */
export function row(titleHtml, detail, T, opts) {
    opts = opts || {};
    var col = new ui.VLayout();
    col.setMargins(0, 0, 0, 0);
    col.setSpaceBetween(1);
    col.add(richLabel(titleHtml));
    if (opts.detailHtml) col.add(richLabel(opts.detailHtml));
    else if (detail) col.add(label(detail, 10, T.muted));

    var line = new ui.HLayout();
    line.setMargins(8, 4, 8, 4);
    line.setSpaceBetween(6);
    if (opts.lead) line.add(opts.lead);
    line.add(col);
    line.addStretch();

    var box = new ui.Container();
    box.setRadius(4, 4, 4, 4);
    box.setLayout(line);
    if (opts.tip) box.setToolTip(opts.tip);
    box.useHoverEvents(true);
    box.setBackgroundColor(T.surface);
    box.onMouseEnter = function () { box.setBackgroundColor(T.hover); };
    box.onMouseLeave = function () { box.setBackgroundColor(T.surface); };
    return box;
}

/** The panel's outer layout: 4px margins, 8px between groups. */
export function panel() {
    var root = new ui.VLayout();
    root.setMargins(4, 4, 4, 4);
    root.setSpaceBetween(8);
    return root;
}
