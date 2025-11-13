import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      '*.min.js',
      'dist/**',
      'build/**',
      'coverage/**',
      'db/migrations/**',
      'db/seeders/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: ['prettier'],
    rules: {
      'no-unused-vars': 'warn',
      'no-ex-assign': 'off',
      'no-console': 'off',
      'no-useless-catch': 'off',

      semi: 'off',
      quotes: 'off',
      indent: 'off',
      'comma-dangle': 'off',
      'object-curly-spacing': 'off',
      'array-bracket-spacing': 'off',
      'space-before-blocks': 'off',
      'keyword-spacing': 'off',
      'space-infix-ops': 'off',
      'no-trailing-spaces': 'off',
      'eol-last': 'off',
      'no-multiple-empty-lines': 'off',
      'brace-style': 'off',
      'comma-spacing': 'off',
      'key-spacing': 'off',
      'space-before-function-paren': 'off',

      'prettier/prettier': 'error'
    }
  },

  {
    extends: ['prettier']
  }
]
