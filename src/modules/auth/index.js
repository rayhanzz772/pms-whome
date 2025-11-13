const Controller = require('./controller')
const router = require('express').Router()

router.post('/login', Controller.login)

module.exports = router;
