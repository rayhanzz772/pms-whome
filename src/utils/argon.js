const argon2 = require('argon2')

async function hash(password) {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    saltLength: 16,
    memoryCost: 2 ** 12,
    timeCost: 3,
    parallelism: 1
  })
}

async function compare(password, hash) {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

module.exports = { hash, compare }
