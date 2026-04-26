/* ── Frostfall Rules Page (read-only public view) ────────────────────────────── */
;(function () {
  'use strict'

  const BACKEND   = window.__BACKEND_URL__ || 'https://api.frostfall.online'
  const TOKEN_KEY = 'ff_dash_token'

  // ── Auth (used only to show the staff notes section) ──────────────────────

  async function getPermissions() {
    const saved = sessionStorage.getItem(TOKEN_KEY)
    if (!saved) return []
    try {
      const res = await fetch(BACKEND + '/auth/dashboard/me', {
        headers: { 'Authorization': 'Bearer ' + saved },
      }).then(r => r.json())
      return (res.ok && res.user) ? (res.user.permissions || []) : []
    } catch { return [] }
  }

  function can(permissions, perm) {
    return permissions.includes('admin.*') || permissions.includes(perm)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ── Render rules ───────────────────────────────────────────────────────────

  function renderRules(rules) {
    const container = document.getElementById('rules-content')
    if (!rules.length) {
      container.innerHTML = `
        <div class="rules-empty">
          <p>The rulebook is being drafted by the Council.</p>
          <p>In the meantime, check our <a href="https://discord.gg/4KHMqUUKNT" target="_blank" rel="noopener">Discord</a> for current expectations.</p>
        </div>`
      return
    }

    let html = '<div class="rules-list">'
    for (const rule of rules) {
      html += `
        <div class="rule-card">
          <span class="rule-number">${rule.order}</span>
          <div class="rule-body">
            <h3 class="rule-title">${esc(rule.title)}</h3>
            <p class="rule-content">${esc(rule.content)}</p>
          </div>
        </div>`
    }
    html += '</div>'
    container.innerHTML = html
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  ;(async function boot() {
    // Load rules (public, no auth needed)
    fetch(BACKEND + '/api/rules')
      .then(r => r.json())
      .then(rules => renderRules(Array.isArray(rules) ? rules : []))
      .catch(() => {
        document.getElementById('rules-content').innerHTML =
          '<div class="rules-empty"><p>Could not load rules. Please try again later.</p></div>'
      })

    // Check if the user is a logged-in staff member with whitelist access
    const permissions = await getPermissions()
    if (can(permissions, 'staff.whitelist_info')) {
      document.getElementById('staff-section').classList.remove('hidden')
      try {
        const doc = await fetch(BACKEND + '/api/whitelist-notes', {
          headers: { 'Authorization': 'Bearer ' + sessionStorage.getItem(TOKEN_KEY) },
        }).then(r => r.json())
        const el = document.getElementById('staff-notes-content')
        el.textContent = (doc && doc.content) ? doc.content : ''
        if (!doc || !doc.content) {
          el.innerHTML = '<span class="rules-staff-empty">No whitelist notes have been written yet.</span>'
        }
      } catch { /* notes failed to load — section stays empty */ }
    }
  })()

}())
