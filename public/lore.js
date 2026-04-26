/* ── Frostfall Lore Wiki (read-only public view) ─────────────────────────────── */
;(function () {
  'use strict'

  const BACKEND = window.__BACKEND_URL__ || 'https://api.frostfall.online'

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function toRoman(n) {
    const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1]
    const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I']
    let result = ''
    for (let i = 0; i < vals.length; i++) {
      while (n >= vals[i]) { result += syms[i]; n -= vals[i] }
    }
    return result
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function renderEntries(entries) {
    const container = document.getElementById('lore-content')

    if (!entries.length) {
      container.innerHTML = `
        <div class="lore-empty">
          <p>The lore council is still compiling the canon.</p>
          <p>Check back soon — or join the conversation on <a href="https://discord.gg/4KHMqUUKNT" target="_blank" rel="noopener">Discord</a>.</p>
        </div>`
      return
    }

    // Group by category, preserving insertion order
    const groups = new Map()
    for (const entry of entries) {
      const cat = entry.category || 'general'
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat).push(entry)
    }

    const chevron = `<svg class="lore-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`

    let html = '<div class="lore-accordion">'
    let entryIndex = 0

    for (const [cat, catEntries] of groups) {
      const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1)
      html += `<div class="lore-category-heading">${esc(catLabel)}</div>`

      for (const entry of catEntries) {
        const numeral = toRoman(++entryIndex)
        const body = esc(entry.content)
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br>')
        html += `
          <details class="lore-entry">
            <summary class="lore-entry-head">
              <span class="lore-numeral" aria-hidden="true">${numeral}</span>
              <span class="lore-entry-title">${esc(entry.title)}</span>
              ${chevron}
            </summary>
            <div class="lore-entry-body"><p>${body}</p></div>
          </details>`
      }
    }

    html += '</div>'
    container.innerHTML = html
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  fetch(BACKEND + '/api/lore')
    .then(r => r.json())
    .then(entries => renderEntries(Array.isArray(entries) ? entries : []))
    .catch(() => {
      document.getElementById('lore-content').innerHTML =
        '<div class="lore-empty"><p>Could not load lore entries. Please try again later.</p></div>'
    })

}())
