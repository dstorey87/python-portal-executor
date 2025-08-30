module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'airbnb-base',
    'airbnb-typescript/base',
    '@typescript-eslint/recommended',
    '@typescript-eslint/recommended-requiring-type-checking'
  ],
  plugins: [
    '@typescript-eslint',
    'import'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  env: {
    node: true,
    es2022: true
  },
  rules: {
    // TypeScript-specific rules
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    
    // Import rules
    'import/extensions': ['error', 'ignorePackages', {
      'ts': 'never',
      'js': 'never'
    }],
    'import/prefer-default-export': 'off',
    'import/no-default-export': 'error',
    'import/order': ['error', {
      'groups': [
        'builtin',
        'external',
        'internal',
        'parent',
        'sibling',
        'index'
      ],
      'newlines-between': 'always',
      'alphabetize': {
        'order': 'asc',
        'caseInsensitive': true
      }
    }],
    
    // General rules
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'no-debugger': 'error',
    'no-unused-vars': 'off', // Handled by TypeScript
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-destructuring': 'error',
    'prefer-template': 'error',
    'template-curly-spacing': 'error',
    'arrow-spacing': 'error',
    'comma-dangle': ['error', 'never'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'indent': ['error', 2],
    'max-len': ['error', {
      'code': 100,
      'ignoreComments': true,
      'ignoreStrings': true,
      'ignoreTemplateLiterals': true
    }],
    
    // Security rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error'
  },
  settings: {
    'import/resolver': {
      'typescript': {
        'alwaysTryTypes': true,
        'project': './tsconfig.json'
      }
    }
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '*.js',
    '*.d.ts'
  ]
};