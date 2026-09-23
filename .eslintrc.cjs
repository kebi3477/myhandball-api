module.exports = {
  root: true,
  extends: ['@koha/config/eslint-base'],
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.cjs'],
};
