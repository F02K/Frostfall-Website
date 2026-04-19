/* Frostfall — live commit feed across the public F02K repositories.
   Pulls the last 4 commits per repo via GitHub's unauthenticated REST API.
   Results are cached so switching tabs is instant. */
(function () {
  const list = document.getElementById("commits-list");
  const tabs = document.querySelectorAll(".commits-tab");
  const browseBtn = document.getElementById("commits-browse-btn");
  if (!list || !tabs.length) return;

  const COUNT = 4;
  const cache = {};

  function timeAgo(iso) {
    const date = new Date(iso);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 14) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 86400 * 60) return `${Math.floor(diff / (86400 * 7))}w ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function shortSha(sha) { return sha.substring(0, 7); }
  function firstLine(msg) { return (msg || "").split("\n")[0]; }
  function escapeHTML(s) {
    return s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function render(commits) {
    list.innerHTML = commits.map((c) => {
      const sha = shortSha(c.sha);
      const msg = escapeHTML(firstLine(c.commit.message));
      const when = timeAgo(c.commit.author.date);
      const url = c.html_url;
      return `
        <li class="commit">
          <a class="commit-sha" href="${url}" target="_blank" rel="noopener"
            title="View commit ${sha} on GitHub">${sha}</a>
          <span class="commit-msg">${msg}</span>
          <span class="commit-date" title="${c.commit.author.date}">${when}</span>
        </li>`;
    }).join("");
    list.setAttribute("aria-busy", "false");
  }

  function renderError(repo) {
    list.innerHTML = `<li class="commit-error">Unable to fetch commits right now — read them on <a href="https://github.com/${repo}/commits" target="_blank" rel="noopener">GitHub</a>.</li>`;
    list.setAttribute("aria-busy", "false");
  }

  function loadRepo(repo) {
    list.innerHTML = '<li class="commit-loading">Fetching recent commits&hellip;</li>';
    list.setAttribute("aria-busy", "true");

    if (browseBtn) browseBtn.href = `https://github.com/${repo}`;

    if (cache[repo]) { render(cache[repo]); return; }

    fetch(`https://api.github.com/repos/${repo}/commits?per_page=${COUNT}`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) throw new Error("empty");
        cache[repo] = data;
        render(data);
      })
      .catch(() => renderError(repo));
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      loadRepo(tab.dataset.repo);
    });
  });

  // Load the first tab on init
  const firstTab = tabs[0];
  firstTab.classList.add("is-active");
  firstTab.setAttribute("aria-selected", "true");
  loadRepo(firstTab.dataset.repo);
})();
