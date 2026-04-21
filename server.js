require('dotenv').config()
const express = require('express')
const path    = require('path')

const app  = express()
const PORT = process.env.PORT || 4001

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (_req, res) => {
  res.render('index')
})

// Direct download — serves the installer from public/files/.
// Drop a new build in as public/files/Frostfall-Launcher-Setup.exe to update.
const INSTALLER_FILE = path.join(__dirname, 'public', 'files', 'Frostfall-Launcher-Setup.exe')
const FALLBACK_DOWNLOAD = 'https://github.com/F02K/Frostfall-Launcher/releases/latest'

app.get('/download', (_req, res) => {
  res.download(INSTALLER_FILE, 'Frostfall-Launcher-Setup.exe', err => {
    if (err) res.redirect(FALLBACK_DOWNLOAD)
  })
})

app.get('/dashboard', (_req, res) => {
  res.render('dashboard', {
    backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
  })
})

app.listen(PORT, () => {
  console.log(`Frostfall running on http://localhost:${PORT}`)
})
