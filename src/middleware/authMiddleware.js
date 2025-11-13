const { HttpStatusCode } = require('axios')
const JWT = require('../utils/jwt')
const { api } = require('../utils/api')
const db = require('../../db/models')
const { getCache, delCache, setCacheWithTTL } = require('../utils/redis')
const cuid = require('cuid')

function clearAuthCookies(res) {
  const opt = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    partitioned: true
  }
  res.clearCookie('access_token', opt)
  res.clearCookie('refresh_token', opt)
  res.clearCookie('x-csrf-token', opt)
}

const authentication = async (req, res, next) => {
  try {
    const accessToken = req.cookies.access_token
    const refreshToken = req.cookies.refresh_token
    let payload

    if (accessToken) {
      try {
        payload = JWT.verifyToken(accessToken)
      } catch (err) {
        if (err.name !== 'TokenExpiredError') {
          throw {
            code: HttpStatusCode.Unauthorized,
            message: 'Token tidak valid'
          }
        }
      }

      if (payload) {
        const user = await db.User.findByPk(payload.id, {
          attributes: ['id', 'status', 'deleted_at'],
          include: [
            {
              model: db.Employee,
              as: 'employee',
              attributes: ['id', 'name', 'email', 'nik', 'status', 'deleted_at'],
              include: [
                {
                  model: db.EmployeeWorkDetail,
                  as: 'employee_work_details',
                  attributes: ['id', 'status', 'is_latest', 'division_id', 'sub_division_id'],
                  required: false,
                  where: { is_latest: true },
                  include: [
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
                      model: db.Position,
                      as: 'position',
                      attributes: ['id', 'name', 'status', 'deleted_at']
                    },
                    {
                      model: db.Company,
                      as: 'company',
                      attributes: ['id', 'name', 'status', 'deleted_at']
                    }
                  ]
                }
              ]
            },
            {
              model: db.Role,
              as: 'role',
              attributes: ['id', 'name', 'status']
            }
          ]
        })

        if (!user || user.status !== 'active' || user.deleted_at !== null) {
          if (refreshToken) await delCache(`refresh_token:${refreshToken}`)
          clearAuthCookies(res)
          throw {
            code: HttpStatusCode.Unauthorized,
            message: 'Pengguna tidak aktif atau telah dihapus'
          }
        }

        if (!user.role || user.role.status !== 'active') {
          if (refreshToken) await delCache(`refresh_token:${refreshToken}`)
          clearAuthCookies(res)
          throw {
            code: HttpStatusCode.Unauthorized,
            message: 'Role Anda tidak aktif atau telah dihapus'
          }
        }

        const workDetail = user.employee?.employee_work_details?.[0]
        if (!workDetail || workDetail.status !== 'active') {
          clearAuthCookies(res)
          throw {
            code: HttpStatusCode.Unauthorized,
            message: 'Detail kerja tidak aktif atau tidak ditemukan'
          }
        }

        const { branch, division, position, company } = workDetail

        if (
          !company ||
          company.status !== 'active' ||
          company.deleted_at !== null
        ) {
          clearAuthCookies(res)
          throw {
            code: HttpStatusCode.Unauthorized,
            message: 'Perusahaan tidak aktif atau telah dihapus'
          }
        }

        if (
          !branch ||
          branch.status !== 'active' ||
          branch.deleted_at !== null
        ) {
          clearAuthCookies(res)
          throw {
            code: HttpStatusCode.Unauthorized,
            message: 'Cabang tidak aktif atau telah dihapus'
          }
        }

        if (
          !division ||
          division.status !== 'active' ||
          division.deleted_at !== null
        ) {
          clearAuthCookies(res)
          throw {
            code: HttpStatusCode.Unauthorized,
            message: 'Divisi tidak aktif atau telah dihapus'
          }
        }

        if (
          !position ||
          position.status !== 'active' ||
          position.deleted_at !== null
        ) {
          clearAuthCookies(res)
          throw {
            code: HttpStatusCode.Unauthorized,
            message: 'Posisi tidak aktif atau telah dihapus'
          }
        }

        req.user = {
          id: user.id,
          name: user.employee.name,
          employee_id: user.employee?.id ?? null,
          email: user.employee?.email ?? null,
          nik: user.employee?.nik ?? null,
          status: user.status,
          role_id: user.role?.id ?? null,
          division_id: workDetail.division_id ?? null,
          sub_division_id: workDetail.sub_division_id ?? null
        }

        return next()
      }
    }

    if (!refreshToken) {
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Tidak ada refresh token'
      }
    }

    const parsed = await getCache(`refresh_token:${refreshToken}`)
    if (!parsed) {
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Refresh token tidak valid'
      }
    }

    if (parsed.absolute_expires_at && Date.now() > parsed.absolute_expires_at) {
      await delCache(`refresh_token:${refreshToken}`)
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Session telah kedaluwarsa, silakan masuk kembali'
      }
    }

    const user = await db.User.findByPk(parsed.user_id, {
      attributes: ['id', 'status', 'deleted_at'],
      include: [
        {
          model: db.Employee,
          as: 'employee',
          attributes: ['id', 'name', 'email', 'nik', 'status', 'deleted_at'],
          include: [
            {
              model: db.EmployeeWorkDetail,
              as: 'employee_work_details',
              attributes: ['id', 'status', 'is_latest', 'division_id', 'sub_division_id'],
              required: false,
              where: { is_latest: true },
              include: [
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
                  model: db.Position,
                  as: 'position',
                  attributes: ['id', 'name', 'status', 'deleted_at']
                },
                {
                  model: db.Company,
                  as: 'company',
                  attributes: ['id', 'name', 'status', 'deleted_at']
                }
              ]
            }
          ]
        },
        {
          model: db.Role,
          as: 'role',
          attributes: ['id', 'name', 'status']
        }
      ]
    })

    if (!user || user.status !== 'active' || user.deleted_at !== null) {
      clearAuthCookies(res)
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Akun tidak aktif atau telah dihapus'
      }
    }

    if (
      !user.employee ||
      user.employee.status !== 'active' ||
      user.employee.deleted_at !== null
    ) {
      clearAuthCookies(res)
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Karyawan tidak aktif atau telah dihapus'
      }
    }

    if (!user.role || user.role.status !== 'active') {
      clearAuthCookies(res)
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Role tidak aktif atau telah dihapus'
      }
    }

    const workDetail = user.employee?.employee_work_details?.[0]
    if (!workDetail || workDetail.status !== 'active') {
      clearAuthCookies(res)
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Detail kerja tidak aktif'
      }
    }

    const { branch, division, position, company } = workDetail
    if (
      !company ||
      company.status !== 'active' ||
      company.deleted_at !== null
    ) {
      clearAuthCookies(res)
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Perusahaan tidak aktif atau telah dihapus'
      }
    }
    if (!branch || branch.status !== 'active' || branch.deleted_at !== null) {
      clearAuthCookies(res)
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Cabang tidak aktif atau telah dihapus'
      }
    }
    if (
      !division ||
      division.status !== 'active' ||
      division.deleted_at !== null
    ) {
      clearAuthCookies(res)
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Divisi tidak aktif atau telah dihapus'
      }
    }
    if (
      !position ||
      position.status !== 'active' ||
      position.deleted_at !== null
    ) {
      clearAuthCookies(res)
      throw {
        code: HttpStatusCode.Unauthorized,
        message: 'Posisi tidak aktif atau telah dihapus'
      }
    }

    const newAccessToken = JWT.generateToken(
      { id: user.id },
      process.env.JWT_EXPIRED || '15m'
    )
    const newRefreshToken = cuid()

    await setCacheWithTTL(
      `refresh_token:${newRefreshToken}`,
      {
        user_id: user.id,
        absolute_expires_at: parsed.remember_me
          ? null
          : Date.now() + 30 * 24 * 60 * 60 * 1000,
        remember_me: parsed.remember_me
      },
      7 * 24 * 60 * 60
    )

    setTimeout(async () => {
      await delCache(`refresh_token:${refreshToken}`)
    }, 10000)

    res.cookie('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      partitioned: true,
      maxAge: 15 * 60 * 1000
    })
    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      partitioned: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    })

    req.user = {
      id: user.id,
      name: user.employee.name,
      employee_id: user.employee?.id ?? null,
      email: user.employee?.email ?? null,
      nik: user.employee?.nik ?? null,
      status: user.status,
      role_id: user.role?.id ?? null,
      division_id: workDetail.division_id ?? null,
      sub_division_id: workDetail.sub_division_id ?? null
    }
    console.log(`auth: refreshed req.user division_id=${req.user.division_id} sub_division_id=${req.user.sub_division_id}`)

    return next()
  } catch (err) {
    console.error(err)
    const code = err?.code ?? HttpStatusCode.InternalServerError
    return res.status(code).json(api(null, code, { err }))
  }
}

const authorizeAccess = (requiredCodes = []) => {
  return async (req, res, next) => {
    try {
      const userRoleId = req.user?.role_id
      if (!userRoleId) {
        return res.status(HttpStatusCode.Unauthorized).json({
          success: false,
          message: 'Role tidak ditemukan'
        })
      }

      const pool = await db.PoolCms.findAll({
        where: { role_id: userRoleId },
        include: [
          {
            model: db.MasterAccess,
            as: 'masterAccess',
            attributes: ['code']
          }
        ]
      })

      const userAccessCodes = pool.map((p) => p.masterAccess.code)

      const allowed = requiredCodes.some((code) =>
        userAccessCodes.includes(code)
      )

      if (!allowed) {
        return res.status(HttpStatusCode.Forbidden).json({
          success: false,
          message: `Anda tidak memiliki akses ke [${requiredCodes.join(', ')}]`
        })
      }

      next()
    } catch (err) {
      console.error(err)
      return res
        .status(HttpStatusCode.InternalServerError)
        .json({ success: false, message: 'Internal Server Error' })
    }
  }
}

const onlySuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'Superadmin') {
    return res.status(HttpStatusCode.Forbidden).json({
      success: false,
      message: 'Hanya Superadmin yang dapat mengakses ini'
    })
  }
  next()
}

module.exports = {
  authentication,
  authorizeAccess,
  onlySuperAdmin
}
