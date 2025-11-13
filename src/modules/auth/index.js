const Controller = require('./controller')
const router = require('express').Router()
const { authentication } = require('../../middleware/auth')

router.post('/login', Controller.loginUser)
router.post('/logout', authentication, Controller.logoutUser)
router.post('/forgot-password', Controller.forgotPassword)
router.post('/block-user', Controller.blockUser)
router.get('/me', authentication, Controller.getMe)

module.exports = router
