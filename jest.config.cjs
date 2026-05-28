module.exports = {
  preset: 'ts-jest',
  testEnvironment: '@happy-dom/jest-environment',
  rootDir: '.',
  testMatch: ['<rootDir>/Sources/CoreEditor/test/**/*.test.ts'],
  collectCoverageFrom: [
    'Sources/CoreEditor/src/utils/**/*.ts',
    'Sources/CoreEditor/src/nodes/image-utils.ts',
    'Sources/CoreEditor/src/plugins/doc-folder.ts',
    'Sources/CoreEditor/src/commands/**/*.ts',
    '!Sources/CoreEditor/src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: { lines: 80, statements: 80, branches: 75, functions: 80 },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: false }] },
};
