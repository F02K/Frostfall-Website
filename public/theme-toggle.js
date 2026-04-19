(function () {
  var root = document.documentElement;
  var btn = document.querySelector("[data-theme-toggle]");

  // Default is dark — the site's primary black & gold identity.
  // Theme state is kept in memory only; no persistence between reloads.
  root.setAttribute("data-theme", root.getAttribute("data-theme") || "dark");

  function paintButton(t) {
    if (!btn) return;
    btn.setAttribute(
      "aria-label",
      t === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
  }

  paintButton(root.getAttribute("data-theme"));

  if (btn) {
    btn.addEventListener("click", function () {
      var current = root.getAttribute("data-theme") || "dark";
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      paintButton(next);
    });
  }
})();
