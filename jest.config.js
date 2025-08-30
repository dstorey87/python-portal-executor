/**
 * Jest configuration for Python Portal Executor
 * Comprehensive testing setup with TypeScript support
 */

export default {
  // Test environment
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  
  // Module resolution
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@python-portal/types$': '<rootDir>/node_modules/@python-portal/types/dist/index.js'
  },
  
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        target: 'ES2022'
      }
    }]
  },
  
  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{ts,tsx}'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Files to collect coverage from
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  // Test timeout
  testTimeout: 30000,
  
  // Globals
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  
  // Module file extensions
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/'
  ],
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(@python-portal|other-esm-packages)/)',
  ],
  
  // Reporter configuration
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage',
      filename: 'test-report.html',
      openReport: false,
      expand: true
    }]
  ],
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Reset modules between tests
  resetMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Memory usage
  logHeapUsage: true,
  
  // Detect handles
  detectOpenHandles: true,
  
  // Force exit
  forceExit: true
};