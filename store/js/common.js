/* Helpers shared by the catalogue and the character detail page. */

window.Store = (function () {
  "use strict";

  return {
    money: function (c) {
      if (c.price === null || c.price === undefined) return { text: "Enquire", cls: "enquire" };
      if (Number(c.price) === 0) return { text: "Free", cls: "free" };
      return { text: SITE.currencySymbol + Number(c.price).toLocaleString(), cls: "" };
    },

    tris: function (c) {
      var t = c.specs && c.specs.tris;
      return t ? Number(t).toLocaleString() + " tris" : "";
    },

    statusLabel: function (s) {
      return {
        available: "Available",
        "coming-soon": "Coming soon",
        "sold-exclusive": "Sold — exclusive",
      }[s] || s;
    },

    // Escape anything that lands in innerHTML. The data is authored locally,
    // but a stray apostrophe or angle bracket shouldn't be able to break the page.
    esc: function (v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      });
    },

    // Placeholder used wherever a character has no image yet.
    emptyMedia:
      '<div class="media-empty">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<circle cx="12" cy="7" r="3.2"/><path d="M4.5 20.5c0-4.2 3.4-6.5 7.5-6.5s7.5 2.3 7.5 6.5"/>' +
        "</svg><span>Preview coming</span></div>",

    // Tiled diagonal watermark drawn over previews at runtime. This sits on top
    // of the watermark already burned into the file by tools/watermark.py —
    // burn-in is the real protection, this is only a visible deterrent.
    watermarkOverlay: function () {
      var line = (SITE.watermarkText + "   ").repeat(6);
      var rows = new Array(14).fill("<span>" + this.esc(line) + "</span>").join("");
      return '<div class="wm-overlay" aria-hidden="true">' + rows + "</div>";
    },

    applyChrome: function () {
      document.querySelectorAll("[data-site-name]").forEach(function (n) { n.textContent = SITE.name; });
      document.querySelectorAll("[data-site-headline]").forEach(function (n) { n.textContent = SITE.headline; });
      document.querySelectorAll("[data-site-tagline]").forEach(function (n) { n.textContent = SITE.tagline; });
      document.querySelectorAll("[data-year]").forEach(function (n) { n.textContent = new Date().getFullYear(); });
      document.querySelectorAll("[data-contact-link]").forEach(function (n) {
        n.href = "mailto:" + SITE.contactEmail;
      });
    },
  };
})();
