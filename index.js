require('dotenv').config({})

const express = require('express')
const app = express()
const morgan = require('morgan')
const cors = require('cors')
const route = require('./src/routes')
const { createServer } = require('node:http')
const cookieParser = require('cookie-parser')

const mode = process.env.NODE_ENV || 'development'
const allowedOriginsRaw = process.env.ALLOWED_ORIGINS || ''
const allowAll = allowedOriginsRaw === '*'

const allowedOrigins = allowAll
  ? []
  : allowedOriginsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

const corsOptions = (req, callback) => {
  const origin = req.headers.origin
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https'

  const isAllowed = () => {
    if (allowAll) return true
    if (!origin) return false
    return allowedOrigins.includes(origin)
  }

  if (mode === 'production') {
    if (isAllowed()) {
      return callback(null, { origin: true, credentials: true })
    }
    return callback(null, false)
  }

  if (isSecure) {
    if (isAllowed()) {
      return callback(null, { origin: true, credentials: true })
    }
    return callback(null, false)
  }

  return callback(null, { origin: true, credentials: true })
}

app.use(morgan('dev'))
app.use(cors(corsOptions))
app.use(cookieParser())
function rawBodySaver(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8')
  }
}

app.use(
  express.urlencoded({ extended: false, limit: '50mb', verify: rawBodySaver })
)
app.use(express.json({ limit: '50mb' }))

app.use('/api/v1', route)

app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Rute tidak ditemukan',
    data: null
  })
})

app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      message: 'Token CSRF tidak valid',
      data: null
    })
  }
  next(err)
})

const port = process.env.PORT || 8000
const server = createServer(app)

server.listen(port, () => {
  console.log(`Server Running ⚡ PORT : ${port}`)
})

module.exports = app
