require('dotenv').config()
const Redis = require('ioredis')

const redisConfig = {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
}

const redis = new Redis(redisConfig)

module.exports = redis
