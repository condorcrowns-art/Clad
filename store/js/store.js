/* Catalogue page: renders the grid, wires up search + category filters. */

(function () {
  "use strict";

  var grid    = document.getElementById("grid");
  var search  = document.getElementById("search");
  var filters = document.getElementById("filters");

  Store.applyChrome();
  if (!grid) return; // detail page shares this bundle's chrome but not its grid

  var state = { q: "", category: "all" };

  function cardHTML(c) {
    var p = Store.money(c);
    var media = c.thumb
      ? '<img src="' + Store.esc(c.thumb) + '" alt="' + Store.esc(c.name) + '" loading="lazy" draggable="false">'
      : Store.emptyMedia;

    return (
      '<a class="card" href="character.html?id=' + encodeURIComponent(c.id) + '">' +
        '<div class="card-media">' + media +
          '<span class="badge ' + Store.esc(c.status) + '">' + Store.esc(Store.statusLabel(c.status)) + "</span>" +
        "</div>" +
        '<div class="card-body">' +
          '<div class="card-title">' + Store.esc(c.name) + "</div>" +
          '<div class="card-sub">' + Store.esc(c.tagline || "") + "</div>" +
          '<div class="card-foot">' +
            '<span class="price ' + p.cls + '">' + Store.esc(p.text) + "</span>" +
            '<span class="polys">' + Store.esc(Store.tris(c)) + "</span>" +
          "</div>" +
        "</div>" +
      "</a>"
    );
  }

  function matches(c) {
    if (state.category !== "all" && c.category !== state.category) return false;
    if (!state.q) return true;
    var hay = [c.name, c.tagline, c.description, c.category, c.style]
      .concat(c.tags || [], c.formats || [])
      .join(" ")
      .toLowerCase();
    return hay.indexOf(state.q) !== -1;
  }

  function render() {
    var list = CHARACTERS.filter(matches);

    if (!list.length) {
      grid.innerHTML =
        '<div class="empty"><h3>' +
        (CHARACTERS.length ? "No characters match that filter." : "No characters listed yet.") +
        "</h3><p>" +
        (CHARACTERS.length
          ? "Try clearing the search or picking a different category."
          : "Add one by editing <code>store/js/data.js</code> — see <code>store/README.md</code> for the checklist.") +
        "</p></div>";
      return;
    }
    grid.innerHTML = list.map(cardHTML).join("");
  }

  function buildFilters() {
    var cats = ["all"].concat(
      CHARACTERS.map(function (c) { return c.category; })
        .filter(function (v, i, a) { return v && a.indexOf(v) === i; })
        .sort()
    );
    // A lone "All" chip tells the user nothing — hide the row until there are
    // at least two real categories to switch between.
    if (cats.length < 3) { filters.hidden = true; return; }

    filters.innerHTML = cats.map(function (cat) {
      return '<button class="chip" type="button" data-cat="' + Store.esc(cat) + '" aria-pressed="' +
        (cat === state.category) + '">' + Store.esc(cat === "all" ? "All" : cat) + "</button>";
    }).join("");
  }

  filters.addEventListener("click", function (e) {
    var btn = e.target.closest(".chip");
    if (!btn) return;
    state.category = btn.dataset.cat;
    filters.querySelectorAll(".chip").forEach(function (c) {
      c.setAttribute("aria-pressed", String(c.dataset.cat === state.category));
    });
    render();
  });

  search.addEventListener("input", function () {
    state.q = search.value.trim().toLowerCase();
    render();
  });

  document.querySelectorAll("[data-stat-count]").forEach(function (n) {
    n.textContent = CHARACTERS.length;
  });
  buildFilters();
  render();
})();
