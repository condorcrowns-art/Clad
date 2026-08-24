/* Character detail page: media stage (3D viewer + watermarked renders),
   spec sheet, and the buy button. */

(function () {
  "use strict";

  var root = document.getElementById("detail");

  // <model-viewer> is the one external dependency, and it only loads when a
  // character actually ships a preview GLB. If it fails (offline, blocked,
  // CDN down) the stage silently falls back to the render gallery.
  var MODEL_VIEWER_SRC = "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js";
  var viewerRequested = false;

  function loadModelViewer() {
    if (viewerRequested) return;
    viewerRequested = true;
    var s = document.createElement("script");
    s.type = "module";
    s.src = MODEL_VIEWER_SRC;
    s.onerror = function () {
      var stage = document.querySelector(".stage");
      if (stage && stage.dataset.fallback) showShot(0, true);
    };
    document.head.appendChild(s);
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function notFound() {
    root.innerHTML =
      '<div class="empty" style="grid-column:1/-1">' +
        "<h3>Character not found</h3>" +
        '<p>That link points at a character that isn\'t listed. ' +
        '<a href="index.html" style="color:var(--accent)">Back to all characters</a>.</p>' +
      "</div>";
  }

  /* ---------- media stage ---------- */

  var current = null;      // the character being displayed
  var shots = [];          // ordered list of stage entries: {type, src}

  function stageHTML(entry) {
    if (!entry) return Store.emptyMedia + Store.watermarkOverlay();

    if (entry.type === "3d") {
      return (
        '<model-viewer src="' + Store.esc(entry.src) + '" ' +
          'alt="Rotatable preview of ' + Store.esc(current.name) + '" ' +
          'camera-controls touch-action="pan-y" shadow-intensity="1" ' +
          'exposure="0.9" environment-image="neutral" ' +
          'disable-tap interaction-prompt="none" ' +
          'style="--poster-color:transparent;background:#101216">' +
        "</model-viewer>" + Store.watermarkOverlay()
      );
    }
    if (entry.type === "video") {
      return (
        '<video src="' + Store.esc(entry.src) + '" autoplay loop muted playsinline ' +
          'controlslist="nodownload" disablepictureinpicture></video>' +
        Store.watermarkOverlay()
      );
    }
    return (
      '<div class="shot"><img src="' + Store.esc(entry.src) + '" alt="' +
      Store.esc(current.name) + '" draggable="false"></div>' + Store.watermarkOverlay()
    );
  }

  function showShot(i, skip3d) {
    var entry = shots[i];
    if (skip3d && entry && entry.type === "3d") {
      // Viewer unavailable — jump to the first still instead.
      i = shots.findIndex(function (s) { return s.type !== "3d"; });
      entry = shots[i];
      if (!entry) return;
    }
    var stage = document.querySelector(".stage");
    if (!stage) return;
    stage.innerHTML = stageHTML(entry);
    if (entry && entry.type === "3d") loadModelViewer();

    document.querySelectorAll(".thumbs button").forEach(function (b, bi) {
      b.setAttribute("aria-current", String(bi === i));
    });
  }

  function thumbsHTML() {
    if (shots.length < 2) return "";
    return (
      '<div class="thumbs">' +
      shots.map(function (s, i) {
        var inner = s.type === "3d"
          ? '<span class="is3d">3D</span>'
          : s.type === "video"
            ? '<span class="is3d">360°</span>'
            : '<img src="' + Store.esc(s.src) + '" alt="" draggable="false">';
        return '<button type="button" data-i="' + i + '" aria-current="' + (i === 0) + '">' + inner + "</button>";
      }).join("") +
      "</div>"
    );
  }

  /* ---------- right-hand column ---------- */

  var SPEC_LABELS = {
    tris: "Triangles",
    verts: "Vertices",
    rigged: "Rigged",
    skeleton: "Skeleton",
    textures: "Textures",
    uvs: "UVs",
    scale: "Scale",
    pose: "Pose",
    lods: "LODs",
  };

  function specHTML(specs) {
    if (!specs) return "";
    var rows = Object.keys(SPEC_LABELS)
      .filter(function (k) { return specs[k] !== undefined && specs[k] !== null && specs[k] !== ""; })
      .map(function (k) {
        var v = specs[k];
        if (typeof v === "boolean") v = v ? "Yes" : "No";
        else if (typeof v === "number") v = v.toLocaleString();
        return "<tr><th>" + Store.esc(SPEC_LABELS[k]) + "</th><td>" + Store.esc(v) + "</td></tr>";
      });
    if (!rows.length) return "";
    return '<h2 class="sec">Specification</h2><table class="spec-table"><tbody>' + rows.join("") + "</tbody></table>";
  }

  function buyHTML(c) {
    var p = Store.money(c);
    var note, action;

    if (c.status === "sold-exclusive") {
      note = "This character was sold under an exclusive licence and is no longer available.";
      action = '<a class="btn" aria-disabled="true" href="#">Not available</a>';
    } else if (c.status === "coming-soon") {
      note = "Not released yet — get in touch to be told when it drops.";
      action = '<a class="btn ghost" data-contact-link href="#">Notify me</a>';
    } else if (c.buyUrl) {
      note = "Instant download after checkout. Commercial licence included.";
      action = '<a class="btn" href="' + Store.esc(c.buyUrl) + '" target="_blank" rel="noopener noreferrer">' +
               (Number(c.price) === 0 ? "Download" : "Buy now") + "</a>";
    } else {
      note = "Contact for pricing and delivery.";
      action = '<a class="btn" data-contact-link href="#">Enquire</a>';
    }

    return (
      '<div class="buybox">' +
        '<span class="price ' + p.cls + '">' + Store.esc(p.text) + "</span>" +
        '<div class="price-note">' + Store.esc(note) + "</div>" +
        action +
        '<a class="btn ghost" data-contact-link href="#">Ask a question</a>' +
      "</div>"
    );
  }

  function listHTML(title, items, cls) {
    if (!items || !items.length) return "";
    return '<h2 class="sec">' + Store.esc(title) + "</h2><ul class=\"" + cls + '">' +
      items.map(function (i) { return "<li>" + Store.esc(i) + "</li>"; }).join("") + "</ul>";
  }

  function pillsHTML(title, items) {
    if (!items || !items.length) return "";
    return '<h2 class="sec">' + Store.esc(title) + '</h2><div class="pill-row">' +
      items.map(function (i) { return '<span class="pill">' + Store.esc(i) + "</span>"; }).join("") + "</div>";
  }

  /* ---------- render ---------- */

  function render(c) {
    current = c;
    document.title = c.name + " — " + SITE.name;

    shots = [];
    if (c.preview3d) shots.push({ type: "3d", src: c.preview3d });
    if (c.turntable) shots.push({ type: "video", src: c.turntable });
    (c.gallery || []).forEach(function (src) { shots.push({ type: "img", src: src }); });
    if (!shots.length && c.thumb) shots.push({ type: "img", src: c.thumb });

    root.innerHTML =
      "<div>" +
        '<div class="stage" data-fallback="1">' + stageHTML(shots[0]) + "</div>" +
        '<div class="viewer-note">' +
          (shots[0] && shots[0].type === "3d"
            ? "Drag to rotate · scroll to zoom. Preview mesh is decimated and unrigged."
            : "All preview images are watermarked. Purchased files are clean.") +
        "</div>" +
        thumbsHTML() +
      "</div>" +
      "<div>" +
        "<h1>" + Store.esc(c.name) + "</h1>" +
        '<p class="tagline">' + Store.esc(c.tagline || "") + "</p>" +
        buyHTML(c) +
        (c.description ? '<p class="desc">' + Store.esc(c.description) + "</p>" : "") +
        specHTML(c.specs) +
        pillsHTML("Formats", c.formats) +
        listHTML("What you get", c.includes, "includes") +
        pillsHTML("Tags", c.tags) +
      "</div>";

    if (shots[0] && shots[0].type === "3d") loadModelViewer();

    var thumbs = root.querySelector(".thumbs");
    if (thumbs) {
      thumbs.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (b) showShot(Number(b.dataset.i));
      });
    }

    Store.applyChrome();
  }

  /* ---------- init ---------- */

  var id = getParam("id");
  var found = CHARACTERS.filter(function (c) { return c.id === id; })[0];

  Store.applyChrome();
  if (found) render(found);
  else notFound();
})();
