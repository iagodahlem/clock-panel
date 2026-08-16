import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

// Flat config (ESLint 10). Code-quality only -- Prettier owns formatting,
// so eslint-config-prettier is applied last to switch off any stylistic rules.
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
)
