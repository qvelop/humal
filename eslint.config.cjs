'use strict';
const js = require('@eslint/js');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      '.git/**'
    ]
  },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly'
      }
    },

    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-throw-literal': 'error',
      'valid-typeof': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-with': 'error',
      'no-proto': 'error',
      'no-unused-vars': [
        'warn',
        {
          args: 'none',
          caughtErrors: 'none'
        }
      ]
    }
  }
];