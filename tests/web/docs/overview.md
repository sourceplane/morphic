# web-tests

The port's tests (the database client per request over Hyperdrive, the product's name and public origin, the committed wrangler config, the owner's keys kept out of the build and handed to the Worker, worker-secrets.mjs); the template's own suite runs in apps/web

The test suite for **web**. It deploys nothing: its lane installs, builds and runs the tests.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `tests/web`          |
| Package      | `@app/web-tests`     |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- (none)
