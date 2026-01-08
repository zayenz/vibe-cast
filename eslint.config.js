import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLElement: 'readonly',
        console: 'readonly',
        React: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        global: 'readonly',
        RequestInit: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        fetch: 'readonly',
        Event: 'readonly',
        MessageEvent: 'readonly',
        EventSource: 'readonly',
        process: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLVideoElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        NodeJS: 'readonly',
        EventListener: 'readonly',
        ResizeObserver: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        URLSearchParams: 'readonly',
        KeyboardEvent: 'readonly',
        Image: 'readonly',
        localStorage: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'react-hooks/purity': 'off', // Allow Math.random in useMemo for stable random values
      'react-hooks/set-state-in-effect': ['warn'], // Allow but warn
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['**/*Techno*.tsx', '**/*Techno*.ts'],
    rules: {
      'react/no-unknown-property': ['error', {
        ignore: ['position', 'args', 'emissive', 'emissiveIntensity', 'attach', 'intensity', 'angle', 'penumbra', 'color', 'speed', 'distort', 'radius', 'roughness', 'metalness', 'transparent', 'opacity'],
      }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'src-tauri/target/**', 'src-tauri/gen/**'],
  },
];

