/* ── Frostfall Admin Dashboard ──────────────────────────────────────────────── */
;(function () {
  'use strict'

  const BACKEND   = window.__BACKEND_URL__ || 'http://localhost:4000'
  const TOKEN_KEY = 'ff_dash_token'

  let token       = null
  let currentPath = '.'
  let editorPath  = null
  let logTimer    = null
  let statusTimer = null

  // ── Helpers ────────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id) }

  function api(method, path, body) {
    return fetch(BACKEND + '/api/admin' + path, {
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json())
  }

  function formatBytes(n) {
    if (!n) return ''
    if (n < 1024)    return n + ' B'
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
    return (n / 1048576).toFixed(1) + ' MB'
  }

  function formatTs(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString()
  }

  function esc(s) {
    return String(s).replace(/'/g, "\\'").replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function isDisconnected(res) {
    return !res || res.error === 'admin service unreachable'
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  document.querySelectorAll('.dash-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab))
  })

  function switchTab(name) {
    document.querySelectorAll('.dash-tab').forEach(t => {
      t.classList.toggle('is-active', t.dataset.tab === name)
      t.setAttribute('aria-selected', t.dataset.tab === name)
    })
    document.querySelectorAll('.dash-panel').forEach(p => {
      p.classList.toggle('hidden', p.id !== 'panel-' + name)
    })
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────

  function showAuth()      { $('auth-gate').classList.remove('hidden') }
  function showDashboard() {
    $('auth-gate').classList.add('hidden')
    $('dashboard').classList.remove('hidden')
  }

  async function tryToken(t) {
    token = t
    try {
      const res = await fetch(BACKEND + '/auth/dashboard/me', {
        headers: { 'Authorization': 'Bearer ' + t },
      }).then(r => r.json())
      if (!res.ok || !res.user) { token = null; return null }
      return res.user
    } catch {
      token = null
      return null
    }
  }

  $('discord-login-btn').addEventListener('click', async () => {
    const btn = $('discord-login-btn')
    btn.disabled = true
    btn.textContent = '…'
    $('auth-error').classList.add('hidden')
    try {
      const redirectBack = window.location.href.split('?')[0]
      const res = await fetch(
        BACKEND + '/auth/dashboard/url?redirect=' + encodeURIComponent(redirectBack)
      ).then(r => r.json())
      if (res.error) throw new Error(res.error)
      window.location.href = res.url
    } catch (err) {
      $('auth-error').textContent = err.message || 'Could not reach auth service.'
      $('auth-error').classList.remove('hidden')
      btn.disabled = false
      btn.innerHTML =
        '<svg class="discord-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>' +
        '</svg>Sign in with Discord'
    }
  })

  $('logout-btn').addEventListener('click', async () => {
    if (token) {
      await fetch(BACKEND + '/auth/dashboard/logout', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token },
      }).catch(() => {})
    }
    sessionStorage.removeItem(TOKEN_KEY)
    token = null
    clearInterval(logTimer)
    clearInterval(statusTimer)
    $('dashboard').classList.add('hidden')
    showAuth()
  })

  function setUserInfo(user) {
    if (!user) return
    const avatar = $('dash-avatar')
    if (user.avatar) { avatar.src = user.avatar; avatar.hidden = false }
    $('dash-username').textContent = user.username || ''
  }

  // ── Status helpers ─────────────────────────────────────────────────────────

  // Apply a state class to all status dots and the ring
  function applyStatusState(state, labelText, metaText) {
    const states = ['running', 'stopped', 'disconnected', 'checking']

    ;[$('status-dot'), $('status-dot-lg')].forEach(el => {
      if (!el) return
      states.forEach(s => el.classList.remove(s))
      el.classList.add(state)
    })

    const ring = document.getElementById('status-ring')
    if (ring) {
      states.forEach(s => ring.classList.remove(s))
      ring.classList.add(state)
    }

    if (labelText !== undefined) {
      ;[$('status-label'), $('status-label-chip')].forEach(el => {
        if (el) el.textContent = labelText
      })
    }
    if (metaText !== undefined && $('server-meta')) {
      $('server-meta').textContent = metaText
    }
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
      applyStatusState(
        'running',
        'Running',
        'PID ' + res.pid + ' · started ' + formatTs(res.startedAt) + ' · ' + res.cmd
      )
    } else {
      applyStatusState('stopped', 'Stopped', res.cmd || '')
    }
  }

  async function serverAction(action) {
    const btn  = $('btn-' + action)
    const orig = btn.textContent
    btn.disabled = true
    btn.textContent = '…'
    try {
      await api('POST', '/server/' + action)
      await refreshStatus()
    } finally {
      btn.disabled = false
      btn.textContent = orig
    }
  }

  window.serverAction = serverAction

  // ── Logs ───────────────────────────────────────────────────────────────────

  async function refreshLogs() {
    const el  = $('log-output')
    const res = await api('GET', '/server/logs?limit=200').catch(() => null)

    if (isDisconnected(res)) {
      el.innerHTML = '<span class="log-faint">Server not connected.</span>'
      return
    }
    if (!res || !res.logs) return

    const lines = res.logs.map(({ ts, line }) => {
      const time    = formatTs(ts)
      const cls     = line.startsWith('[err]') ? 'log-err'
                    : line.startsWith('---')   ? 'log-sep'
                    : ''
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<span class="${cls}">[${time}] ${escaped}</span>`
    })

    el.innerHTML = lines.join('\n') || '<span class="log-faint">No logs yet.</span>'
    if ($('log-follow').checked) el.scrollTop = el.scrollHeight
  }

  window.refreshLogs = refreshLogs

  // ── File manager ───────────────────────────────────────────────────────────

  async function loadDir(path) {
    currentPath = path
    renderBreadcrumb(path)

    const list = $('file-list')
    list.innerHTML = '<div class="dash-file-empty">Loading…</div>'

    const res = await api('GET', '/files?path=' + encodeURIComponent(path)).catch(() => null)

    if (isDisconnected(res)) {
      list.innerHTML = '<div class="dash-file-empty">Server not connected.</div>'
      return
    }
    if (!res || res.error) {
      list.innerHTML = '<div class="dash-file-empty">' + (res?.error || 'Error loading directory') + '</div>'
      return
    }
    if (!res.entries.length) {
      list.innerHTML = '<div class="dash-file-empty">Empty directory.</div>'
      return
    }

    const entries = [...res.entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    list.innerHTML = entries.map(e => {
      const fullPath = (path === '.' ? '' : path + '/') + e.name
      const nameBtn  = e.type === 'dir'
        ? `<button class="dash-file-name is-dir" onclick="loadDir('${esc(fullPath)}')">${esc(e.name)}/</button>`
        : `<button class="dash-file-name" onclick="openEditor('${esc(fullPath)}')">${esc(e.name)}</button>`
      const delBtn = `<button class="dash-file-del" title="Delete" onclick="deleteFile('${esc(fullPath)}')">✕</button>`
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
    const parts = path === '.' ? [] : path.split('/')
    let html    = `<button class="dash-bc-btn" onclick="loadDir('.')">root</button>`
    let built   = ''
    for (const p of parts) {
      built = built ? built + '/' + p : p
      const b = built
      html += `<span class="dash-bc-sep">/</span><button class="dash-bc-btn" onclick="loadDir('${esc(b)}')">${esc(p)}</button>`
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

  $('upload-input').addEventListener('change', async e => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      await fetch(BACKEND + '/api/admin/files/upload?path=' + encodeURIComponent(currentPath), {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body:    fd,
      })
    }
    e.target.value = ''
    loadDir(currentPath)
  })

  // ── Editor ─────────────────────────────────────────────────────────────────

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

  function closeEditor() {
    $('editor-backdrop').classList.add('hidden')
    editorPath = null
  }

  window.closeEditor = closeEditor

  async function saveFile() {
    if (!editorPath) return
    const content = $('editor-area').value
    const res = await api('PUT', '/files/content', { path: editorPath, content, encoding: 'utf8' }).catch(() => null)
    if (isDisconnected(res)) return alert('Server not connected.')
    if (!res || res.error)   return alert('Save failed: ' + (res?.error || 'unknown error'))
    closeEditor()
  }

  window.saveFile = saveFile

  $('editor-backdrop').addEventListener('click', e => {
    if (e.target === $('editor-backdrop')) closeEditor()
  })

  // ── Init ───────────────────────────────────────────────────────────────────

  function init(user) {
    setUserInfo(user)
    showDashboard()
    refreshStatus()
    refreshLogs()
    loadDir('.')

    clearInterval(statusTimer)
    clearInterval(logTimer)
    statusTimer = setInterval(refreshStatus, 5000)
    logTimer    = setInterval(refreshLogs,   4000)
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  ;(async function boot() {
    const params   = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    const urlError = params.get('error')

    if (urlError) {
      history.replaceState({}, '', window.location.pathname)
      const msgs = {
        cancelled:    'Discord login was cancelled.',
        unauthorized: 'Your Discord account is not authorised for this dashboard.',
        expired:      'Login session expired. Please try again.',
        server_error: 'A server error occurred. Please try again.',
      }
      $('auth-error').textContent = msgs[urlError] || 'Login failed: ' + urlError
      $('auth-error').classList.remove('hidden')
      showAuth()
      return
    }

    if (urlToken) {
      history.replaceState({}, '', window.location.pathname)
      const user = await tryToken(urlToken)
      if (user) {
        sessionStorage.setItem(TOKEN_KEY, urlToken)
        init(user)
        return
      }
      $('auth-error').textContent = 'Invalid or expired session token.'
      $('auth-error').classList.remove('hidden')
      showAuth()
      return
    }

    const saved = sessionStorage.getItem(TOKEN_KEY)
    if (saved) {
      const user = await tryToken(saved)
      if (user) { init(user); return }
      sessionStorage.removeItem(TOKEN_KEY)
    }

    showAuth()
  })()

  $('auth-gate').classList.remove('hidden')

}())
