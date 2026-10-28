# db-tests

The migrations' tests (the manifest and its checksums, each app migration the byte-identical twin of apps/web/drizzle's in its journal's order, the generated Better Auth key, and Supabase's Data API shut out of every table in public after every migration, on an in-process Postgres set up as a Supabase project)

The test suite for **db**. It deploys nothing: its lane installs, builds and runs the tests.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `tests/db`           |
| Package      | `@app/db-tests`      |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- (none)
