import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

const importSortGroups = [
  ['^react', '^next'],
  ['^@?\\w'],
  ['^@/types'],
  ['^@/config'],
  ['^@/lib'],
  ['^@/hooks'],
  ['^@/components/ui'],
  ['^@/components'],
  ['^@/registry'],
  ['^@/styles'],
  ['^@/app'],
  ['^\\u0000'],
  ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
  ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
  ['^.+\\.s?css$']
]

export default defineConfig([
  ...nextVitals,
  {
    plugins: {
      'simple-import-sort': simpleImportSort
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: importSortGroups
        }
      ],
      'simple-import-sort/exports': 'error'
    }
  },
  {
    // New in eslint-config-next 16.3 (the template linted with 16.2.3; the
    // Cloudflare adapter needs Next >= 16.3.8): it flags the template's
    // `useEffect(() => { … setState(…) })` pattern in eleven places. The
    // template is kept as written.
    rules: {
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // The Workers build: OpenNext's output, wrangler's state, and the
    // bindings' generated types.
    '.open-next/**',
    '.wrangler/**',
    'cloudflare-env.d.ts'
  ])
])
