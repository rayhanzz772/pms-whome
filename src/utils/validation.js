const { HttpStatusCode } = require('axios')

const validateRequest = (schema, req, source = 'body') => {
  let data = {}
  if (source === 'query') data = { ...req.query }
  else if (source === 'params') data = req.params
  else data = req.body

  const result = schema.safeParse(data)

  if (!result.success) {
    const issues = result.error.issues || []
    if (issues.length === 0) {
      throw {
        code: HttpStatusCode.UnprocessableEntity,
        message: 'Invalid request'
      }
    }

    const messages = issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }))

    throw {
      code: HttpStatusCode.UnprocessableEntity,
      message: messages[0]?.message || 'Invalid request',
      metadata: { errors: messages }
    }
  }

  return result.data
}

const validationFiles = (files, validationRules) => {
  try {
    if (!files || Object.keys(files).length === 0) {
      return true
    }

    for (const rule of validationRules) {
      const { name, allowed_mimes, max_size } = rule

      if (files[name]) {
        const fileArray = Array.isArray(files[name])
          ? files[name]
          : [files[name]]

        for (const file of fileArray) {
          if (allowed_mimes && allowed_mimes.length > 0) {
            const fileMime = file.mimetype.split('/')[1]
            const isValidMime = allowed_mimes.some((mime) => {
              if (mime.includes('/')) {
                return file.mimetype === mime
              } else {
                return (
                  fileMime === mime || (mime === 'jpg' && fileMime === 'jpeg')
                )
              }
            })

            if (!isValidMime) {
              throw {
                code: HttpStatusCode.BadRequest,
                message: `Format file ${name} harus ${allowed_mimes.join(', ')}`
              }
            }
          }

          if (max_size && file.size > max_size) {
            const maxSizeMB = (max_size / (1024 * 1024)).toFixed(1)
            throw {
              code: HttpStatusCode.BadRequest,
              message: `Maksimal pengiriman file ${maxSizeMB}MB.`
            }
          }
        }
      }
    }

    return true
  } catch (error) {
    throw error
  }
}

module.exports = {
  validateRequest,
  validationFiles
}
