module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    semi: ['error', 'always'],
    'no-console': ['error', { allow: ['warn', 'error', 'info', 'log', 'debug'] }],
  },
  ignorePatterns: ['node_modules', 'docs/openapi.json'],
};
