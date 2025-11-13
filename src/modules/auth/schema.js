const { z } = require('zod')

const LoginSchema = z.object({
  nik: z
    .string()
    .length(16, 'NIK harus terdiri dari 16 digit')
    .min(1, 'NIK wajib tidak boleh kosong'),
  password: z.string().min(1, 'Kata sandi tidak boleh kosong'),
  remember_me: z.boolean().optional().default(false)
})

const ForgotPasswordSchema = z.object({
  nik: z
    .string({
      required_error: 'NIK wajib tidak boleh kosong'
    })
    .min(1, 'NIK wajib tidak boleh kosong')
    .trim()
    .length(16, 'NIK harus terdiri dari 16 digit')
})

const BlockUserSchema = z.object({
  nik: z
    .string({
      required_error: 'NIK wajib tidak boleh kosong'
    })
    .min(1, 'NIK wajib tidak boleh kosong')
    .trim()
    .length(16, 'NIK harus terdiri dari 16 digit')
})

module.exports = {
  LoginSchema,
  ForgotPasswordSchema,
  BlockUserSchema
}
