// https://docs.expo.dev/guides/using-eslint/
// Uses @eslint/js + @typescript-eslint directly to avoid the
// @eslint/eslintrc Node.js v24 / ajv incompatibility in eslint-config-expo/flat
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        __DEV__: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Relax rules common in React Native / Expo projects
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off', // handled by @typescript-eslint/no-unused-vars
    },
  },
  {
    // CommonJS config files at project root — need Node.js globals + commonjs sourceType
    files: ['babel.config.js', 'metro.config.js', 'react-native.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // All other JS/JSX files (ES modules)
    files: ['**/*.js', '**/*.jsx'],
    ignores: ['babel.config.js', 'metro.config.js', 'react-native.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    ignores: ['dist/*', 'node_modules/*', 'android/*', '.expo/*'],
  },
];
