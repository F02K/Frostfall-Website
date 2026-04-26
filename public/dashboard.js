/* ── Frostfall Staff Dashboard ───────────────────────────────────────────────── */
;(function () {
  'use strict'

  // These are injected server-side by dashboard.ejs (only when logged in)
  const BACKEND = window.__BACKEND_URL__ || 'https://api.frostfall.online'
  const TOKEN   = window.__DASH_TOKEN__  || ''

  let currentPath    = '.'
  let editorPath     = null
  let logTimer       = null
  let statusTimer    = null

  let currentLoreEntries = []
  let currentRules       = []
  let currentWhitelist   = []
  let loreEditingId      = null
  let rulesEditingId     = null
  let notesContent       = ''

  let loreEditorInst  = null
  let ruleEditorInst  = null
  let notesEditorInst = null

  // ── Helpers ────────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id) }

  // Calls backend /api/admin/* (server control, files, logs)
  function api(method, path, body) {
    return fetch(BACKEND + '/api/admin' + path, {
      method,
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json())
  }

  // Calls other backend endpoints (lore, rules, whitelist-notes)
  function backendApi(method, path, body) {
    return fetch(BACKEND + path, {
      method,
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json())
  }

  function formatBytes(n) {
    if (!n) return ''
    if (n < 1024)    return n + ' B'
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
    return (n / 1048576).toFixed(1) + ' MB'
  }

  function formatTs(ts) { return ts ? new Date(ts).toLocaleTimeString() : '' }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function escAttr(s) {
    return String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;')
  }

  function isDisconnected(res) { return !res || res.error === 'admin service unreachable' }

  // ── Markdown editor factory ────────────────────────────────────────────────

  function makeEditor(mountId, initialValue) {
    const mount = $(mountId)
    if (!mount) return { getValue: () => '', setValue: () => {} }

    mount.innerHTML = ''

    const toolbar = document.createElement('div')
    toolbar.className = 'dash-ed-toolbar'
    toolbar.innerHTML =
      '<button type="button" class="dash-ed-btn" data-wrap="**" title="Bold"><strong>B</strong></button>' +
      '<button type="button" class="dash-ed-btn dash-ed-btn--italic" data-wrap="*" title="Italic"><em>I</em></button>' +
      '<button type="button" class="dash-ed-btn" data-prefix="## " title="Heading">H2</button>' +
      '<button type="button" class="dash-ed-btn" data-prefix="- " title="Bullet">•</button>' +
      '<span class="dash-ed-sep"></span>' +
      '<button type="button" class="dash-ed-toggle is-active" data-mode="write">Write</button>' +
      '<button type="button" class="dash-ed-toggle" data-mode="preview">Preview</button>'

    const textarea = document.createElement('textarea')
    textarea.className   = 'dash-ed-textarea'
    textarea.spellcheck  = false
    textarea.placeholder = 'Write in Markdown…'
    textarea.value       = initialValue || ''

    const preview = document.createElement('div')
    preview.className = 'dash-ed-preview hidden'

    mount.appendChild(toolbar)
    mount.appendChild(textarea)
    mount.appendChild(preview)

    toolbar.querySelectorAll('[data-wrap]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap  = btn.dataset.wrap
        const start = textarea.selectionStart
        const end   = textarea.selectionEnd
        const sel   = textarea.value.slice(start, end) || 'text'
        textarea.setRangeText(wrap + sel + wrap, start, end, 'end')
        textarea.focus()
      })
    })

    toolbar.querySelectorAll('[data-prefix]').forEach(btn => {
      btn.addEventListener('click', () => {
        const prefix    = btn.dataset.prefix
        const start     = textarea.selectionStart
        const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1
        textarea.setRangeText(prefix, lineStart, lineStart, 'end')
        textarea.focus()
      })
    })

    toolbar.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode
        toolbar.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('is-active', b === btn))
        if (mode === 'preview') {
          preview.innerHTML = window.marked
            ? window.marked.parse(textarea.value || '')
            : '<pre>' + esc(textarea.value) + '</pre>'
          textarea.classList.add('hidden')
          preview.classList.remove('hidden')
        } else {
          preview.classList.add('hidden')
          textarea.classList.remove('hidden')
          textarea.focus()
        }
      })
    })

    return {
      getValue: () => textarea.value,
      setValue: v => {
        textarea.value = v || ''
        const writeBtn = toolbar.querySelector('[data-mode="write"]')
        if (writeBtn && !writeBtn.classList.contains('is-active')) writeBtn.click()
      },
    }
  }

  // ── View switching ─────────────────────────────────────────────────────────

  document.querySelectorAll('.dash-nav-item').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view))
  })

  function switchView(name) {
    document.querySelectorAll('.dash-nav-item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.view === name)
    })
    document.querySelectorAll('.dash-view').forEach(view => {
      view.classList.toggle('hidden', view.id !== 'view-' + name)
    })
    if (name === 'lore')  loadLoreView()
    if (name === 'rules') loadRulesView()
    if (name === 'whitelist') loadWhitelistView()
  }

  // ── Inner tab switching (Server view) ─────────────────────────────────────

  document.querySelectorAll('.dash-inner-tab').forEach(tab => {
    tab.addEventListener('click', () => switchInnerTab(tab.dataset.inner))
  })

  function switchInnerTab(name) {
    document.querySelectorAll('.dash-inner-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset.inner === name)
      tab.setAttribute('aria-selected', String(tab.dataset.inner === name))
    })
    document.querySelectorAll('.dash-inner-panel').forEach(panel => {
      panel.classList.toggle('hidden', panel.id !== 'inner-' + name)
    })
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  function applyStatusState(state, labelText, metaText) {
    const states = ['running', 'stopped', 'disconnected', 'checking']
    ;[$('status-dot-lg'), $('nav-status-dot')].forEach(el => {
      if (!el) return
      states.forEach(s => el.classList.remove(s))
      el.classList.add(state)
    })
    const ring = $('status-ring')
    if (ring) {
      states.forEach(s => ring.classList.remove(s))
      ring.classList.add(state)
    }
    if (labelText !== undefined && $('status-label'))
      $('status-label').textContent = labelText
    if (metaText !== undefined && $('server-meta'))
      $('server-meta').textContent = metaText
  }

  function setControlsDisabled(disabled) {
    ;['start', 'stop', 'restart'].forEach(a => {
      const btn = $('btn-' + a)
      if (btn) btn.disabled = disabled
    })
  }

  // ── Server control ─────────────────────────────────────────────────────────

  async function refreshStatus() {
    applyStatusState('checking', '…', '')
    const res = await api('GET', '/server/status').catch(() => null)
    if (isDisconnected(res)) {
      applyStatusState('disconnected', 'Not connected', '')
      setControlsDisabled(true)
      return
    }
    setControlsDisabled(false)
    if (res.running) {
      applyStatusState('running', 'Running',
        'PID ' + res.pid + ' · started ' + formatTs(res.startedAt) + ' · ' + res.cmd)
    } else {
      applyStatusState('stopped', 'Stopped', res.cmd || '')
    }
  }

  async function serverAction(action) {
    const btn  = $('btn-' + action)
    const orig = btn.textContent
    btn.disabled = true; btn.textContent = '…'
    try {
      await api('POST', '/server/' + action)
      await refreshStatus()
    } finally {
      btn.disabled = false; btn.textContent = orig
    }
  }

  window.serverAction = serverAction

  // ── Logs ───────────────────────────────────────────────────────────────────

  async function refreshLogs() {
    const el  = $('log-output')
    if (!el) return
    const res = await api('GET', '/server/logs?limit=200').catch(() => null)
    if (isDisconnected(res)) { el.innerHTML = '<span class="log-faint">Server not connected.</span>'; return }
    if (!res || !res.logs) return
    const lines = res.logs.map(({ ts, line }) => {
      const time    = formatTs(ts)
      const cls     = line.startsWith('[err]') ? 'log-err' : line.startsWith('---') ? 'log-sep' : ''
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<span class="${cls}">[${time}] ${escaped}</span>`
    })
    el.innerHTML = lines.join('\n') || '<span class="log-faint">No logs yet.</span>'
    const follow = $('log-follow')
    if (follow && follow.checked) el.scrollTop = el.scrollHeight
  }

  window.refreshLogs = refreshLogs

  // ── File manager ───────────────────────────────────────────────────────────

  async function loadDir(path) {
    currentPath = path
    renderBreadcrumb(path)
    const list = $('file-list')
    if (!list) return
    list.innerHTML = '<div class="dash-file-empty">Loading…</div>'
    const res = await api('GET', '/files?path=' + encodeURIComponent(path)).catch(() => null)
    if (isDisconnected(res)) { list.innerHTML = '<div class="dash-file-empty">Server not connected.</div>'; return }
    if (!res || res.error)   { list.innerHTML = '<div class="dash-file-empty">' + esc(res?.error || 'Error') + '</div>'; return }
    if (!res.entries.length) { list.innerHTML = '<div class="dash-file-empty">Empty directory.</div>'; return }

    const entries = [...res.entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    list.innerHTML = entries.map(e => {
      const fp      = (path === '.' ? '' : path + '/') + e.name
      const nameBtn = e.type === 'dir'
        ? `<button class="dash-file-name is-dir" onclick="loadDir('${escAttr(fp)}')">${esc(e.name)}/</button>`
        : `<button class="dash-file-name" onclick="openEditor('${escAttr(fp)}')">${esc(e.name)}</button>`
      const delBtn = `<button class="dash-file-del" title="Delete" onclick="deleteFile('${escAttr(fp)}')">✕</button>`
      return `<div class="dash-file-row">
        <span class="dash-file-icon">${e.type === 'dir' ? '📁' : '📄'}</span>
        ${nameBtn}
        <span class="dash-file-size">${formatBytes(e.size)}</span>
        <div class="dash-file-actions">${e.type === 'file' ? delBtn : ''}</div>
      </div>`
    }).join('')
  }

  function renderBreadcrumb(path) {
    const bc    = $('breadcrumb')
    if (!bc) return
    const parts = path === '.' ? [] : path.split('/')
    let html    = `<button class="dash-bc-btn" onclick="loadDir('.')">root</button>`
    let built   = ''
    for (const p of parts) {
      built = built ? built + '/' + p : p
      html += `<span class="dash-bc-sep">/</span><button class="dash-bc-btn" onclick="loadDir('${escAttr(built)}')">${esc(p)}</button>`
    }
    bc.innerHTML = html
  }

  window.loadDir = loadDir

  async function deleteFile(path) {
    if (!confirm('Delete ' + path + '?')) return
    await api('DELETE', '/files?path=' + encodeURIComponent(path))
    loadDir(currentPath)
  }

  window.deleteFile = deleteFile

  // ── Upload ─────────────────────────────────────────────────────────────────

  const uploadInput = $('upload-input')
  if (uploadInput) {
    uploadInput.addEventListener('change', async e => {
      const files = Array.from(e.target.files)
      if (!files.length) return
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        await fetch(BACKEND + '/api/admin/files/upload?path=' + encodeURIComponent(currentPath), {
          method:  'POST',
          headers: { Authorization: 'Bearer ' + TOKEN },
          body:    fd,
        })
      }
      e.target.value = ''
      loadDir(currentPath)
    })
  }

  // ── Raw file editor ────────────────────────────────────────────────────────

  async function openEditor(path) {
    const res = await api('GET', '/files/content?path=' + encodeURIComponent(path)).catch(() => null)
    if (isDisconnected(res)) return alert('Server not connected.')
    if (!res || res.error)   return alert('Cannot read file: ' + (res?.error || 'unknown error'))
    if (res.encoding === 'base64') return alert('Binary files cannot be edited in the browser.')
    editorPath = path
    $('editor-title').textContent = path
    $('editor-area').value = res.content
    $('editor-backdrop').classList.remove('hidden')
    $('editor-area').focus()
  }

  window.openEditor = openEditor

  function closeEditor() { $('editor-backdrop').classList.add('hidden'); editorPath = null }
  window.closeEditor = closeEditor

  async function saveFile() {
    if (!editorPath) return
    const res = await api('PUT', '/files/content', { path: editorPath, content: $('editor-area').value, encoding: 'utf8' }).catch(() => null)
    if (isDisconnected(res)) return alert('Server not connected.')
    if (!res || res.error)   return alert('Save failed: ' + (res?.error || 'unknown error'))
    closeEditor()
  }

  window.saveFile = saveFile

  const editorBackdrop = $('editor-backdrop')
  if (editorBackdrop) {
    editorBackdrop.addEventListener('click', e => { if (e.target === editorBackdrop) closeEditor() })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LORE VIEW
  // ══════════════════════════════════════════════════════════════════════════

  async function loadLoreView() {
    const list = $('dash-lore-list')
    if (!list) return
    list.innerHTML = '<div class="dash-file-empty">Loading…</div>'
    try {
      const entries = await backendApi('GET', '/api/lore')
      currentLoreEntries = Array.isArray(entries) ? entries : []
      renderLoreList()
    } catch {
      list.innerHTML = '<div class="dash-file-empty">Failed to load lore entries.</div>'
    }
  }

  function renderLoreList() {
    const list = $('dash-lore-list')
    if (!list) return
    if (!currentLoreEntries.length) {
      list.innerHTML = '<div class="dash-file-empty">No lore entries yet. Create one to get started.</div>'
      return
    }
    const total = currentLoreEntries.length
    list.innerHTML = currentLoreEntries.map((e, i) => `
      <div class="dash-file-row" data-id="${escAttr(e.id)}">
        <span class="dash-file-icon">📜</span>
        <button class="dash-file-name" onclick="loreDashEdit('${escAttr(e.id)}')">${esc(e.title)}</button>
        <span class="dash-file-size">${esc(e.category || 'general')}</span>
        <div class="dash-file-actions">
          <button class="dash-btn dash-btn-ghost dash-btn-sm" onclick="loreMove('${escAttr(e.id)}',-1)" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="dash-btn dash-btn-ghost dash-btn-sm" onclick="loreMove('${escAttr(e.id)}',1)"  ${i === total - 1 ? 'disabled' : ''} title="Move down">↓</button>
          <button class="dash-file-del" title="Delete" onclick="loreDashDelete('${escAttr(e.id)}','${escAttr(e.title)}')">✕</button>
        </div>
      </div>`).join('')
  }

  window.loreMove = async function (id, dir) {
    const idx = currentLoreEntries.findIndex(e => e.id === id)
    if (idx < 0) return
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= currentLoreEntries.length) return
    ;[currentLoreEntries[idx], currentLoreEntries[swapIdx]] = [currentLoreEntries[swapIdx], currentLoreEntries[idx]]
    renderLoreList()
    try { await backendApi('PUT', '/api/lore/reorder', { ids: currentLoreEntries.map(e => e.id) }) } catch {}
  }

  function loreNewEntry() {
    loreEditingId = null
    $('lore-entry-modal-title').textContent = 'New Lore Entry'
    $('lore-entry-title').value    = ''
    $('lore-entry-category').value = ''
    loreEditorInst = makeEditor('lore-editor-mount', '')
    $('lore-entry-backdrop').classList.remove('hidden')
    $('lore-entry-title').focus()
  }

  window.loreNewEntry = loreNewEntry

  window.loreDashEdit = async function (id) {
    try {
      const entry = await backendApi('GET', '/api/lore/' + id)
      loreEditingId = id
      $('lore-entry-modal-title').textContent = 'Edit Lore Entry'
      $('lore-entry-title').value    = entry.title    || ''
      $('lore-entry-category').value = entry.category || ''
      loreEditorInst = makeEditor('lore-editor-mount', entry.content || '')
      $('lore-entry-backdrop').classList.remove('hidden')
      $('lore-entry-title').focus()
    } catch { alert('Could not load entry.') }
  }

  window.loreDashDelete = async function (id, title) {
    if (!confirm('Delete "' + title + '"?')) return
    try { await backendApi('DELETE', '/api/lore/' + id); loadLoreView() }
    catch { alert('Delete failed.') }
  }

  function closeLoreEntryModal() {
    $('lore-entry-backdrop').classList.add('hidden')
    loreEditingId = null; loreEditorInst = null
  }

  async function saveLoreEntry() {
    const title    = $('lore-entry-title').value.trim()
    const category = $('lore-entry-category').value.trim()
    const content  = loreEditorInst ? loreEditorInst.getValue().trim() : ''
    if (!title || !content) { alert('Title and content are required.'); return }
    const btn = $('lore-save-btn')
    btn.disabled = true; btn.textContent = '…'
    try {
      if (loreEditingId) await backendApi('PUT',  '/api/lore/' + loreEditingId, { title, category, content })
      else               await backendApi('POST', '/api/lore',                  { title, category, content })
      closeLoreEntryModal(); loadLoreView()
    } catch { alert('Save failed.') }
    finally { btn.disabled = false; btn.textContent = 'Save' }
  }

  window.closeLoreEntryModal = closeLoreEntryModal
  window.saveLoreEntry       = saveLoreEntry

  const loreBackdrop = $('lore-entry-backdrop')
  if (loreBackdrop) loreBackdrop.addEventListener('click', e => { if (e.target === loreBackdrop) closeLoreEntryModal() })

  // ══════════════════════════════════════════════════════════════════════════
  // RULES VIEW
  // ══════════════════════════════════════════════════════════════════════════

  async function loadRulesView() {
    const list = $('dash-rules-list')
    if (!list) return
    list.innerHTML = '<div class="dash-file-empty">Loading…</div>'
    try {
      const rules = await backendApi('GET', '/api/rules')
      currentRules = Array.isArray(rules) ? rules : []
      renderRulesList()
    } catch {
      list.innerHTML = '<div class="dash-file-empty">Failed to load rules.</div>'
    }
  }

  function renderRulesList() {
    const list = $('dash-rules-list')
    if (!list) return
    if (!currentRules.length) {
      list.innerHTML = '<div class="dash-file-empty">No rules yet. Create one to get started.</div>'
      return
    }
    const total = currentRules.length
    list.innerHTML = currentRules.map((r, i) => `
      <div class="dash-file-row" data-id="${escAttr(r.id)}">
        <span class="dash-file-icon" style="font-family:var(--font-mono);font-size:.75rem;color:var(--color-gold)">${r.order || i + 1}</span>
        <button class="dash-file-name" onclick="rulesDashEdit('${escAttr(r.id)}')">${esc(r.title)}</button>
        <span class="dash-file-size"></span>
        <div class="dash-file-actions">
          <button class="dash-btn dash-btn-ghost dash-btn-sm" onclick="ruleMove('${escAttr(r.id)}',-1)" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="dash-btn dash-btn-ghost dash-btn-sm" onclick="ruleMove('${escAttr(r.id)}',1)"  ${i === total - 1 ? 'disabled' : ''} title="Move down">↓</button>
          <button class="dash-file-del" title="Delete" onclick="rulesDashDelete('${escAttr(r.id)}','${escAttr(r.title)}')">✕</button>
        </div>
      </div>`).join('')
  }

  window.ruleMove = async function (id, dir) {
    const idx = currentRules.findIndex(r => r.id === id)
    if (idx < 0) return
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= currentRules.length) return
    ;[currentRules[idx], currentRules[swapIdx]] = [currentRules[swapIdx], currentRules[idx]]
    currentRules.forEach((r, i) => { r.order = i + 1 })
    renderRulesList()
    try { await backendApi('PUT', '/api/rules/reorder', { ids: currentRules.map(r => r.id) }) } catch {}
  }

  function rulesNewEntry() {
    rulesEditingId = null
    $('rule-entry-modal-title').textContent = 'New Rule'
    $('rule-entry-title').value = ''
    ruleEditorInst = makeEditor('rule-editor-mount', '')
    $('rule-entry-backdrop').classList.remove('hidden')
    $('rule-entry-title').focus()
  }

  window.rulesNewEntry = rulesNewEntry

  window.rulesDashEdit = async function (id) {
    try {
      const rules = await backendApi('GET', '/api/rules')
      const rule  = rules.find(r => r.id === id)
      if (!rule) return
      rulesEditingId = id
      $('rule-entry-modal-title').textContent = 'Edit Rule'
      $('rule-entry-title').value = rule.title || ''
      ruleEditorInst = makeEditor('rule-editor-mount', rule.content || '')
      $('rule-entry-backdrop').classList.remove('hidden')
      $('rule-entry-title').focus()
    } catch { alert('Could not load rule.') }
  }

  window.rulesDashDelete = async function (id, title) {
    if (!confirm('Delete rule "' + title + '"?')) return
    try { await backendApi('DELETE', '/api/rules/' + id); loadRulesView() }
    catch { alert('Delete failed.') }
  }

  function closeRuleEntryModal() {
    $('rule-entry-backdrop').classList.add('hidden')
    rulesEditingId = null; ruleEditorInst = null
  }

  async function saveRuleEntry() {
    const title   = $('rule-entry-title').value.trim()
    const content = ruleEditorInst ? ruleEditorInst.getValue().trim() : ''
    if (!title || !content) { alert('Title and content are required.'); return }
    const btn = $('rule-save-btn')
    btn.disabled = true; btn.textContent = '…'
    try {
      if (rulesEditingId) await backendApi('PUT',  '/api/rules/' + rulesEditingId, { title, content })
      else                await backendApi('POST', '/api/rules',                   { title, content })
      closeRuleEntryModal(); loadRulesView()
    } catch { alert('Save failed.') }
    finally { btn.disabled = false; btn.textContent = 'Save' }
  }

  window.closeRuleEntryModal = closeRuleEntryModal
  window.saveRuleEntry       = saveRuleEntry

  const ruleBackdrop = $('rule-entry-backdrop')
  if (ruleBackdrop) ruleBackdrop.addEventListener('click', e => { if (e.target === ruleBackdrop) closeRuleEntryModal() })

  // ── Staff notes ────────────────────────────────────────────────────────────

  // WHITELIST VIEW

  async function loadWhitelistView() {
    const list = $('dash-whitelist-list')
    const count = $('dash-whitelist-count')
    if (!list) return

    list.innerHTML = '<div class="dash-file-empty">Loading...</div>'
    if (count) count.textContent = 'Loading...'

    try {
      const res = await backendApi('GET', '/api/whitelist')
      currentWhitelist = Array.isArray(res.players) ? res.players : []
      renderWhitelistList(res)
    } catch {
      currentWhitelist = []
      list.innerHTML = '<div class="dash-file-empty">Failed to load whitelisted players.</div>'
      if (count) count.textContent = ''
    }

    try {
      const doc = await backendApi('GET', '/api/whitelist-notes')
      notesContent = doc.content || ''
      const notes = $('dash-notes-content')
      if (notes) notes.textContent = notesContent || '(no notes yet)'
    } catch {
      const notes = $('dash-notes-content')
      if (notes) notes.textContent = '(could not load notes)'
    }
  }

  function renderWhitelistList(res) {
    const list = $('dash-whitelist-list')
    const count = $('dash-whitelist-count')
    if (!list) return

    if (count) {
      const source = res && res.roleId ? 'Role ' + res.roleId : 'No role configured'
      count.textContent = `${currentWhitelist.length} player${currentWhitelist.length === 1 ? '' : 's'} · ${source}`
    }

    if (!currentWhitelist.length) {
      list.innerHTML = '<div class="dash-file-empty">' + esc(res?.message || 'No whitelisted players found.') + '</div>'
      return
    }

    list.innerHTML = currentWhitelist.map(player => {
      const avatar = player.avatar
        ? `<img class="dash-player-avatar" src="${escAttr(player.avatar)}" alt="">`
        : '<span class="dash-player-avatar dash-player-avatar--empty"></span>'
      const joined = player.joinedAt ? new Date(player.joinedAt).toLocaleDateString() : 'Unknown join date'
      return `<div class="dash-player-row">
        ${avatar}
        <div class="dash-player-main">
          <span class="dash-player-name">${esc(player.displayName || player.username || player.discordId)}</span>
          <span class="dash-player-sub">${esc(player.username || '')} · ${esc(player.discordId)}</span>
        </div>
        <div class="dash-player-future">
          <span class="dash-player-pill">${esc(player.characterName || 'Character pending')}</span>
          <span class="dash-player-pill">${esc(player.racePreset || 'Race preset pending')}</span>
        </div>
        <span class="dash-file-size">${esc(joined)}</span>
      </div>`
    }).join('')
  }

  window.loadWhitelistView = loadWhitelistView

  function rulesEditNotes() {
    notesEditorInst = makeEditor('notes-editor-mount', notesContent)
    $('notes-entry-backdrop').classList.remove('hidden')
  }

  function closeNotesEntryModal() { $('notes-entry-backdrop').classList.add('hidden'); notesEditorInst = null }

  async function saveNotesEntry() {
    const content = notesEditorInst ? notesEditorInst.getValue() : ''
    const btn     = $('notes-save-btn')
    btn.disabled = true; btn.textContent = '…'
    try {
      const doc = await backendApi('PUT', '/api/whitelist-notes', { content })
      notesContent = doc.content || ''
      $('dash-notes-content').textContent = notesContent || '(no notes yet)'
      closeNotesEntryModal()
    } catch { alert('Save failed.') }
    finally { btn.disabled = false; btn.textContent = 'Save' }
  }

  window.rulesEditNotes       = rulesEditNotes
  window.closeNotesEntryModal = closeNotesEntryModal
  window.saveNotesEntry       = saveNotesEntry

  const notesBackdrop = $('notes-entry-backdrop')
  if (notesBackdrop) notesBackdrop.addEventListener('click', e => { if (e.target === notesBackdrop) closeNotesEntryModal() })

  // ── Init ───────────────────────────────────────────────────────────────────

  // Switch to first nav item that was rendered (determined by permissions server-side)
  const firstNav = document.querySelector('.dash-nav-item')
  if (firstNav) switchView(firstNav.dataset.view)

  // Start server polling only if the server view was rendered
  if ($('view-server')) {
    refreshStatus()
    refreshLogs()
    loadDir('.')
    statusTimer = setInterval(refreshStatus, 5000)
    logTimer    = setInterval(refreshLogs,   4000)
  }

}())
