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

app.get('/dashboard', (_req, res) => {
  res.render('dashboard', {
    backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
  })
})

app.listen(PORT, () => {
  console.log(`Frostfall running on http://localhost:${PORT}`)
})
