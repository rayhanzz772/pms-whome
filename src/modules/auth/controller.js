const { api } = require('../../utils/api')
const db = require('../../../db/models')
const argon = require('../../utils/argon')
const JWT = require('../../utils/jwt')
const { HttpStatusCode } = require('axios')
const { validateRequest } = require('../../utils/validation')
const {
  LoginSchema,
  ForgotPasswordSchema,
  BlockUserSchema
} = require('./schema')
const { setCacheWithTTL, delCache } = require('../../utils/redis')
const {
  handleLoginAttempt,
  checkLockStatus,
  resetLoginAttempts
} = require('../../utils/login-limitter')

const s3File = require('../../utils/s3')
const cuid = require('cuid')

class Controller {
  static async loginUser(req, res) {
    try {
      const data = validateRequest(LoginSchema, req)
      const key = `login:user:${data.nik}`

      const lockStatus = await checkLockStatus(key)
      if (lockStatus.locked) {
        return res.status(423).json({
          code: 423,
          message: 'Akun Anda terkunci.',
          remaining: `${lockStatus.remaining}s`,
          action: 'Silakan hubungi HRD untuk melakukan reset kata sandi.'
        })
      }

      const user = await db.User.findOne({
        include: [
          {
            model: db.Employee,
            as: 'employee',
            where: { nik: data.nik },
            include: [
              {
                model: db.EmployeeWorkDetail,
                as: 'employee_work_details',
                where: { is_latest: true },
                required: false,
                include: [
                  {
                    model: db.Company,
                    as: 'company',
                    attributes: ['id', 'name', 'status', 'deleted_at']
                  },
                  {
                    model: db.Branch,
                    as: 'branch',
                    attributes: ['id', 'name', 'status', 'deleted_at']
                  },
                  {
                    model: db.Division,
                    as: 'division',
                    attributes: ['id', 'name', 'status', 'deleted_at']
                  },
                  {
                    model: db.Division,
                    as: 'sub_division',
                    attributes: ['id', 'name', 'status', 'deleted_at']
                  },
                  {
                    model: db.Position,
                    as: 'position',
                    attributes: ['id', 'name', 'status', 'deleted_at']
                  }
                ]
              }
            ]
          },
          {
            model: db.Role,
            as: 'role',
            include: [
              {
                model: db.RoleAccess,
                as: 'role_accesses',
                include: [{ model: db.MasterAccess, as: 'master_access' }]
              }
            ]
          }
        ]
      })

      if (!user) {
        throw {
          code: HttpStatusCode.Unauthorized,
          message: 'NIK belum terdaftar'
        }
      }

      if (user.status !== 'active' || user.deleted_at !== null) {
        throw {
          code: HttpStatusCode.Unauthorized,
          message:
            'Akun Anda tidak aktif atau telah dihapus, hubungi administrator'
        }
      }

      if (
        !user.employee ||
        user.employee.status !== 'active' ||
        user.employee.deleted_at !== null
      ) {
        throw {
          code: HttpStatusCode.Unauthorized,
          message:
            'Status karyawan Anda tidak aktif atau telah dihapus, hubungi administrator'
        }
      }

      const workDetail = user.employee.employee_work_details?.[0]
      if (!workDetail || workDetail.status !== 'active') {
        throw {
          code: HttpStatusCode.Unauthorized,
          message: 'Detail kerja Anda tidak aktif, hubungi administrator'
        }
      }

      const { company, branch, division, sub_division, position } = workDetail

      if (
        !company ||
        company.status !== 'active' ||
        company.deleted_at !== null
      ) {
        throw {
          code: HttpStatusCode.Unauthorized,
          message:
            'Perusahaan tidak aktif atau telah dihapus, hubungi administrator'
        }
      }

      if (!branch || branch.status !== 'active' || branch.deleted_at !== null) {
        throw {
          code: HttpStatusCode.Unauthorized,
          message:
            'Cabang tidak aktif atau telah dihapus, hubungi administrator'
        }
      }

      if (
        !division ||
        division.status !== 'active' ||
        division.deleted_at !== null
      ) {
        throw {
          code: HttpStatusCode.Unauthorized,
          message:
            'Divisi tidak aktif atau telah dihapus, hubungi administrator'
        }
      }

      if (
        !position ||
        position.status !== 'active' ||
        position.deleted_at !== null
      ) {
        throw {
          code: HttpStatusCode.Unauthorized,
          message:
            'Posisi tidak aktif atau telah dihapus, hubungi administrator'
        }
      }

      const validatedPassword = await argon.compare(
        data.password,
        user.password
      )
      if (!validatedPassword) {
        const attempt = await handleLoginAttempt(`login:user:${data.nik}`)
        if (attempt.locked) {
          const remainingSeconds = Math.ceil(attempt.duration / 1000)
          return res.status(423).json({
            code: 423,
            message: 'Akun Anda terkunci.',
            remaining: `${remainingSeconds}s`
          })
        }

        let remainingAttempts
        if (attempt.lockLevel === 0) {
          remainingAttempts = 3 - attempt.total
        } else if (attempt.lockLevel === 1) {
          remainingAttempts = 2 - attempt.total
        } else if (attempt.lockLevel === 2) {
          remainingAttempts = 5 - attempt.total
        } else {
          remainingAttempts = 0
        }

        return res.status(401).json({
          code: 401,
          message: 'NIK atau kata sandi salah.',
          remaining:
            remainingAttempts > 0
              ? `${remainingAttempts} attempts`
              : '0 attempts'
        })
      }
      await resetLoginAttempts(key)

      const allAccess = await db.MasterAccess.findAll({
        attributes: ['id', 'name', 'code']
      })

      const assignedAccessIds =
        user.role?.role_accesses?.map((ra) => ra.master_access?.id) ?? []

      const access = allAccess.map((acc) => ({
        id: acc.id,
        name: acc.name,
        code: acc.code,
        assigned: assignedAccessIds.includes(acc.id)
      }))

      if (!user.role || user.role.status !== 'active') {
        throw {
          code: HttpStatusCode.Unauthorized,
          message:
            'Role Anda tidak aktif atau telah dihapus, hubungi administrator'
        }
      }

      const payload = {
        id: user.id,
        employee_id: user.employee?.id ?? null,
        nik: user.employee?.nik,
        name: user.employee?.name ?? user.name,
        email: user.employee?.email ?? null
      }

      const accessToken = JWT.generateToken(payload, '15m')
      const refreshToken = cuid()
      const rememberMe = data.remember_me ?? false
      const absoluteExpiresAt = rememberMe
        ? null
        : Date.now() + 30 * 24 * 60 * 60 * 1000

      await setCacheWithTTL(
        `refresh_token:${refreshToken}`,
        {
          user_id: user.id,
          absolute_expires_at: absoluteExpiresAt,
          remember_me: rememberMe
        },
        7 * 24 * 60 * 60
      )

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        partitioned: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      })

      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        partitioned: true,
        maxAge: 15 * 60 * 1000
      })

      const result = {
        ...payload,
        role_id: user.role_id,
        role_name: user.role?.name ?? 'none',
        division_id: workDetail.division_id,
        division_name: workDetail.division?.name ?? null,
        sub_division_id: workDetail.sub_division_id,
        sub_division_name: workDetail.sub_division?.name ?? null,
        picture: await s3File.getFile(user.employee?.picture ?? null),
        access,
        division: {
          id: division?.id ?? null,
          name: division?.name ?? null
        },
        sub_division: {
          id: sub_division?.id ?? null,
          name: sub_division?.name ?? null
        }
      }

      await db.User.update(
        { last_login_at: new Date() },
        { where: { id: user.id } }
      )

      return res
        .status(HttpStatusCode.Ok)
        .json(api(result, HttpStatusCode.Ok, { req }))
    } catch (err) {
      console.log(err)
      const code = err?.code ?? HttpStatusCode.InternalServerError
      return res.status(code).json(api(null, code, { err }))
    }
  }

  static async logoutUser(req, res) {
    try {
      const refreshToken = req.cookies.refresh_token

      if (refreshToken) {
        await delCache(`refresh_token:${refreshToken}`)
      }
      res.clearCookie('access_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        partitioned: true
      })

      res.clearCookie('_csrf', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' ? true : false,
        sameSite: 'none'
      })

      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' ? true : false,
        sameSite: 'none',
        partitioned: true
      })

      return res
        .status(HttpStatusCode.Ok)
        .json(api({}, HttpStatusCode.Ok, { req }))
    } catch (err) {
      console.log(err)
      const code = err?.code ?? HttpStatusCode.InternalServerError
      return res.status(code).json(api(null, code, { err }))
    }
  }

  static async forgotPassword(req, res) {
    try {
      const data = validateRequest(ForgotPasswordSchema, req)

      const employee = await db.Employee.findOne({
        where: { nik: data.nik, deleted_at: null, status: 'active' },
        attributes: ['id', 'name', 'email']
      })

      if (!employee) {
        throw {
          code: HttpStatusCode.NotFound,
          message: 'NIK tidak ditemukan dalam data karyawan'
        }
      }

      const user = await db.User.findOne({
        where: { employee_id: employee.id, deleted_at: null, status: 'active' }
      })

      if (!user) {
        throw {
          code: HttpStatusCode.NotFound,
          message: 'Akun pengguna tidak ditemukan untuk NIK tersebut'
        }
      }

      const existingRequest = await db.UserApproval.findOne({
        where: {
          user_id: user.id,
          type: 'forgot_password',
          status: 'pending'
        }
      })

      if (existingRequest) {
        throw {
          code: HttpStatusCode.BadRequest,
          message: 'Permintaan lupa kata sandi masih menunggu persetujuan HRD'
        }
      }

      await db.UserApproval.create({
        id: cuid(),
        user_id: user.id,
        type: 'forgot_password',
        field: { reset_request: true },
        status: 'pending',
        reason: 'Permintaan lupa kata sandi',
        created_at: new Date(),
        updated_at: new Date()
      })

      return res
        .status(HttpStatusCode.Ok)
        .json(api({}, HttpStatusCode.Ok, { req }))
    } catch (err) {
      console.error(err)
      const code = err?.code ?? HttpStatusCode.InternalServerError
      return res.status(code).json(api(null, code, { err }))
    }
  }

  static async blockUser(req, res) {
    try {
      const data = validateRequest(BlockUserSchema, req, 'body')

      const employee = await db.Employee.findOne({
        where: { nik: data.nik, deleted_at: null, status: 'active' },
        attributes: ['id', 'name', 'email']
      })

      if (!employee) {
        throw {
          code: HttpStatusCode.NotFound,
          message: 'NIK tidak ditemukan dalam data karyawan'
        }
      }

      const user = await db.User.findOne({
        where: { employee_id: employee.id, deleted_at: null, status: 'active' }
      })

      if (!user) {
        throw {
          code: HttpStatusCode.NotFound,
          message: 'Akun pengguna tidak ditemukan untuk NIK tersebut'
        }
      }

      const existingRequest = await db.UserApproval.findOne({
        where: {
          user_id: user.id,
          type: 'block_user',
          status: 'pending'
        }
      })

      if (existingRequest) {
        throw {
          code: HttpStatusCode.BadRequest,
          message:
            'Permintaan buka blokir pengguna masih menunggu persetujuan HRD'
        }
      }

      await db.UserApproval.create({
        id: cuid(),
        user_id: user.id,
        type: 'block_user',
        field: { block_request: true },
        status: 'pending',
        reason: 'Permintaan buka blokir pengguna',
        created_at: new Date(),
        updated_at: new Date()
      })

      return res
        .status(HttpStatusCode.Ok)
        .json(api({}, HttpStatusCode.Ok, { req }))
    } catch (err) {
      console.error(err)
      const code = err?.code ?? HttpStatusCode.InternalServerError
      return res.status(code).json(api(null, code, { err }))
    }
  }

  static async getMe(req, res) {
    try {
      const user = await db.User.findByPk(req.user.id, {
        include: [
          {
            model: db.Employee,
            as: 'employee',
            required: false,
            attributes: ['id', 'nik', 'name', 'email', 'picture']
          },
          {
            model: db.Role,
            as: 'role',
            include: [
              {
                model: db.RoleAccess,
                as: 'role_accesses',
                include: [{ model: db.MasterAccess, as: 'master_access' }]
              }
            ]
          }
        ]
      })

      if (!user) {
        throw { code: HttpStatusCode.NotFound, message: 'User tidak ditemukan' }
      }

      const allAccess = await db.MasterAccess.findAll({
        attributes: ['id', 'name', 'code']
      })

      const assignedAccessIds =
        user.role?.role_accesses?.map((ra) => ra.master_access?.id) ?? []

      const access = allAccess.map((acc) => ({
        id: acc.id,
        name: acc.name,
        code: acc.code,
        assigned: assignedAccessIds.includes(acc.id)
      }))

      let picture = null
      if (user.employee?.picture) {
        try {
          picture = await s3File.getFile(user.employee.picture)
        } catch (s3Err) {
          console.warn(`Failed to retrieve S3 file: ${s3Err.message}`)
          picture = null
        }
      }

      const result = {
        id: user.id,
        nik: user.employee?.nik ?? null,
        name: user.employee?.name,
        email: user.employee?.email ?? null,
        picture,
        role_id: user.role?.id ?? null,
        role_name: user.role?.name ?? 'none',
        status: user.status,
        access
      }

      await db.User.update(
        { last_activity: new Date() },
        { where: { id: user.id } }
      )

      return res
        .status(HttpStatusCode.Ok)
        .json(api(result, HttpStatusCode.Ok, { req }))
    } catch (err) {
      console.error(err)
      const code = err?.code ?? HttpStatusCode.InternalServerError
      return res.status(code).json(api(null, code, { err }))
    }
  }
}

module.exports = Controller
