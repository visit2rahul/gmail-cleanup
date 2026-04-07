module.exports = {
  testMatch: ['**/tests/**/*.test.js'],
  moduleFileExtensions: ['js', 'gs', 'json'],
  transform: {
    '\\.gs$': '<rootDir>/tests/mocks/gs-transformer.js',
  },
};
