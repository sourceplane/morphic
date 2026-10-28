#!/usr/bin/env bash
# TIER 2 — the product a bootstrap produces builds, migrates, deploys (dry),
# serves, and answers a question and keeps it, with no vendor key.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree,
# and that its own plan converges in the right order. This proves it WORKS,
# by doing to it what its own pipelines will:
#
#   1. at the 01-product landing (the commit its PR merges), install with the
#      lockfile the product ships, render the wrangler fixture (which must
#      change nothing: the render is committed), typecheck, lint, test — the
#      template's own suite with the port's, and the product's tests/ — and
#      build. The landing itself is checked in the build box with
#      `orun validate` and `orun plan` alone (`checks: local`), and its PR runs
#      `plan` alone (an `orun/BASE-*` branch), so THIS is where a product those
#      steps refuse is caught: before the tag, not after a build has merged it;
#   2. a Postgres of its own on a random port, with Supabase's roles — the
#      database a Supabase project would be: `postgres` a login role WITHOUT
#      superuser or BYPASSRLS, `anon` and `authenticated` with the Data API's
#      default grants (testing/lib/local-postgres.sh) — and a stand-in for the
#      ONE Supabase Management API endpoint the migration runner calls
#      (testing/lib/fake-supabase-api.py), connected as `postgres`;
#   3. the db-migrate lane's own steps, rendered by `orun plan` for a push to
#      main and run IN THE TREE THE RUNNER STAGES for the job: install, build
#      @saas/db, apply — every migration: upstream's twenty-one, the generated
#      Better Auth key, the Data API shut out — then apply again, which must
#      apply nothing, and the pull-request profile's offline plan;
#   4. the web lane's own steps for stage, rendered for a pull request (the
#      verify profile carries deploy-dry-run; the deploy profile does not) and
#      run in its staged job tree: install, `verify-app-structure` (the
#      committed wrangler.jsonc must exist BEFORE the build, in a tree with no
#      build output), `build-app` — which re-renders the config from the
#      stage wiring document it is handed, as the deploy does, and pushes no
#      Worker secret from a lane with no Cloudflare credential — then
#      `verify-build-output` and `deploy-dry-run`;
#   5. the built Worker under `wrangler dev`, its HYPERDRIVE binding pointed at
#      that Postgres, exactly as it deploys — Better Auth, invite-only, no key
#      of any kind — and the component's OWN `smokeCommand` against it,
#      verbatim, then every route the product promises: the answer engine
#      under the product's own name with "No enabled model available" in its
#      picker, `/api/health` (answered only by the Worker), sign-up closed
#      until BOOTSTRAP_ADMIN_EMAIL is set, the proxy sending a signed-out
#      visitor to sign in, the chat refusing one, a 404;
#   6. the same Worker again, given what an owner gives it — a model — as
#      Worker variables (`wrangler dev --var`, no .dev.vars), in upstream's
#      anonymous mode: Better Auth's sign-up runs only through server actions,
#      which no script can drive, and the chat path is the same either way.
#      The model is a stand-in for an OpenAI-compatible API
#      (testing/lib/fake-openai.py): a question asked through the chat route,
#      the answer streamed back, the chat, its messages and their parts
#      written to Postgres through Hyperdrive, and the history listing it;
#   7. the Data API's view of the same database: every table in `public` has
#      row-level security, and `anon` and `authenticated` — granted
#      everything Supabase grants them — can neither read the chat the app
#      just wrote nor write one, while the app, as the tables' owner and
#      nothing more, just did both.
#
# WHAT IS VERIFIED ONLY OFFLINE: the models and the search providers. The
# stand-in answers in the API's shapes, so the app's provider, its stream and
# its persistence are the real ones; what a real model calls, and what a real
# search returns, is not tested here. Nor is the platform's half: create the
# repository, mint the brokered tokens, create a real Supabase project and
# Hyperdrive config (Terraform is validated, not applied, in this
# repository), deploy for real and probe workers.dev. That is a bootstrap
# against a workspace (BOOTSTRAP.md); everything short of it is here.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, psql, a PostgreSQL
# server install (initdb, pg_ctl), and the network for `pnpm install` (or a
# warm store) and for the template's own tests that resolve a public name. A
# few minutes: three installs, two builds.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"
# shellcheck source=lib/local-postgres.sh
source "$here/lib/local-postgres.sh"

for bin in orun node pnpm python3 git curl psql; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done
pg_bin >/dev/null || { echo "e2e.test.sh needs a PostgreSQL server install (initdb, pg_ctl)" >&2; exit 1; }

scratch="$(mktemp -d)"
pgdir="$(mktemp -d)"
dev_pid=""
api_pid=""
model_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So each
# server is started as its own process group (setsid) and the group stopped.
stop_group() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  kill -TERM -- "-$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$pid" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$pid" 2>/dev/null || true
}
cleanup() {
  stop_group "$dev_pid"
  stop_group "$api_pid"
  stop_group "$model_pid"
  pg_down "$pgdir"
  [ -n "$pgdir" ] && [ -d "$pgdir" ] && rm -rf "$pgdir"
  [ -n "$scratch" ] && [ -d "$scratch" ] && rm -rf "$scratch"
}
trap cleanup EXIT
free_port() { python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()"; }
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1

# The landing's own checks, step for step — what the product's Checks
# workflow ran on a pull request before the product carried ci.yml alone —
# run here at once on the whole tree.
LANDING_CHECKS=(
  "pnpm install --frozen-lockfile"
  "pnpm run wire:fixture"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
  "pnpm build"
)
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  for cmd in "${LANDING_CHECKS[@]}"; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done
}

# One job of a plan, written out as the runner would run it: each `run:` step
# (the `use:` actions are setup-node and setup-pnpm, which this machine has)
# as a numbered script, the job's env, and the component path the steps run
# in. Steps are picked BY ID when given, else every `run:` step in order.
extract_job() { # PLAN JOB-ID OUT-DIR [STEP-ID…]
  python3 - "$@" <<'PY'
import json, pathlib, sys
plan, jid, out, *want = sys.argv[1:]
job = next((j for j in json.load(open(plan))["jobs"] if j["id"] == jid), None)
if job is None:
    sys.exit(f"the plan has no job {jid}")
out = pathlib.Path(out); out.mkdir(parents=True)
steps = [s for s in job["steps"] if s.get("run")]
if want:
    by = {s["id"]: s for s in steps}
    missing = [w for w in want if w not in by]
    if missing:
        sys.exit(f"{jid} has no step(s) {missing}")
    steps = [by[w] for w in want]
for i, s in enumerate(steps):
    (out / f"{i:02d}.sh").write_text(s["run"])
    (out / f"{i:02d}.id").write_text(s["id"])
(out / "path").write_text(job.get("path") or ".")
with (out / "env").open("w") as f:
    for k, v in (job.get("env") or {}).items():
        f.write(f"export {k}={json.dumps(v)}\n")
PY
}
run_job() { # STEPS-DIR WORK-TREE ENV LOG-PREFIX
  local steps="$1" work="$2" envname="$3" logp="$4" s id
  for s in "$steps"/[0-9][0-9].sh; do
    id="$(cat "${s%.sh}.id")"
    echo "   ▸ $id"
    if ! (cd "$work/$(cat "$steps/path")" && source "$steps/env" && export ORUN_ENVIRONMENT="$envname" \
          && bash -e "$s") > "$logp-$id.log" 2>&1; then
      echo "FAIL: the lane's $id step" >&2; tail -40 "$logp-$id.log" >&2; return 1
    fi
  done
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
echo "   2 phases placed and landed"

# ── 1. the product's own pull request ──────────────────────────────────────
echo "── 01-product's landing: install, the fixture render, typecheck, lint, test, build"
s01="$(git -C "$tree" rev-parse HEAD~1)"
at01="$scratch/at-01/$repo"
git -C "$tree" worktree add -q "$at01" "$s01"
checks "$at01" "$scratch/checks.log"
dirty="$(git -C "$at01" status --porcelain)"
[ -z "$dirty" ] || { echo "FAIL: the checks changed tracked files — the committed wrangler.jsonc is not the fixture render:" >&2; echo "$dirty" >&2; exit 1; }
echo "   the checks left the tree as committed (wire:fixture rendered the committed wrangler.jsonc)"

# ── 2. a database, and the one API the migration runner calls ──────────────
echo "── a local Postgres and the Supabase Management API stand-in"
pgurl="$(pg_up "$pgdir" "$(free_port)")" || { echo "FAIL: Postgres did not start" >&2; exit 1; }
api_port="$(free_port)"
ref="localproject"
setsid python3 "$here/lib/fake-supabase-api.py" "$api_port" "$pgurl" --ref "$ref" > "$scratch/api.log" 2>&1 < /dev/null &
api_pid=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$api_port/" && break; sleep 0.3; done
echo "   $pgurl; the API on :$api_port"

# The two plans the lanes below run from, each in the product's own tree: a
# push to main at the 01-product commit (the db-migrate lane's APPLY profile),
# and a pull request over the finished product against an empty base (the web
# lane's VERIFY profile, which carries deploy-dry-run, and db-migrate's PLAN).
(cd "$at01" && orun plan --intent intent.yaml --trigger github-push-main --env stage --output "$scratch/plan-main.json") > "$scratch/plan-main.log" 2>&1 \
  || { echo "FAIL: orun plan (push to main)" >&2; tail -15 "$scratch/plan-main.log" >&2; exit 1; }
git -C "$tree" worktree remove --force "$at01"
mkdir -p "$scratch/pr"
git clone -q "$tree" "$scratch/pr/$repo"
prtree="$scratch/pr/$repo"
git -C "$prtree" checkout -q --orphan empty
git -C "$prtree" rm -rqf .
git -C "$prtree" -c user.email=t@example.invalid -c user.name=t commit -qm empty --allow-empty
git -C "$prtree" checkout -q main
(cd "$prtree" && orun plan --intent intent.yaml --trigger github-pull-request --base empty --head HEAD --env stage \
   --output "$scratch/plan-pr.json") > "$scratch/plan-pr.log" 2>&1 \
  || { echo "FAIL: orun plan (pull request)" >&2; tail -15 "$scratch/plan-pr.log" >&2; exit 1; }
# This tier runs the bootstrap floor, newer than the orun the product's CI
# pins, and both read the per-edge `modeRules`: on a pull request — which
# applies and deploys nothing — the infrastructure edges that order a push to
# main are advisory, so no lane waits on another. (placement.test.sh checks
# the push to main's order.)
python3 - "$scratch/plan-pr.json" <<'PY'
import json, sys
jobs = {j["component"]: j for j in json.load(open(sys.argv[1]))["jobs"] if j["environment"] == "stage"}
chain = ["supabase", "cloudflare-hyperdrive", "db-migrate", "web"]
for a, b in zip(chain, chain[1:]):
    ja, jb = jobs[a], jobs[b]
    if ja["id"] in (jb.get("dependsOn") or []) or ja["id"] not in (jb.get("advisoryDependsOn") or []):
        sys.exit(f"FAIL: on a pull request {b}@stage must name {a}@stage as advisory, not wait on it")
print("   pull request: " + " → ".join(chain) + ", every edge advisory")
PY

# ── 3. the db-migrate lane, in its staged job tree ─────────────────────────
echo "── the stage db-migrate lane: install, build @saas/db, apply — then apply again, and the PR's plan"
extract_job "$scratch/plan-main.json" db-migrate.stage.migrate "$scratch/steps-migrate" \
  install-dependencies build-db-package "Migration Apply"
extract_job "$scratch/plan-main.json" db-migrate.stage.migrate "$scratch/steps-migrate-again" "Migration Apply"
extract_job "$scratch/plan-pr.json" db-migrate.stage.migrate "$scratch/steps-migrate-plan" "Migration Plan"
# Staged from the fresh clone (a CI checkout: no build output, no
# node_modules); its migrations are the 01-product commit's, byte for byte.
mwork="$prtree/.orun/runs/e2e/db-migrate.stage.migrate/work"
python3 "$here/lib/stage-job.py" "$prtree" "$mwork"
# The component's secretEnv, as the lane resolves it: the supabase apply's
# published credentials and the brokered access token. SUPABASE_API_URL is
# the one value no lane has — it points the runner at the stand-in.
export SUPABASE_ACCESS_TOKEN=e2e-token SUPABASE_PROJECT_REF="$ref" SUPABASE_DB_PASSWORD=postgres \
       SUPABASE_DB_URL="$pgurl" SUPABASE_API_URL="http://127.0.0.1:$api_port"
run_job "$scratch/steps-migrate" "$mwork" stage "$scratch/migrate"
applied() { python3 -c "import json,sys;t=open(sys.argv[1]).read();print(' '.join(json.loads(t[t.index('{'):t.rindex('}')+1])['applied']))" "$1"; }
want="$(python3 -c "import re,sys;print(' '.join(re.findall(r'id: \"([^\"]+)\"', open(sys.argv[1]).read())))" "$prtree/packages/db/src/manifest.ts")"
case "$want" in
  "000_control_baseline 100_black_lifeguard "*" 120_add_parts_search_fts 200_app_secrets 210_row_level_security") ;;
  *) echo "FAIL: the product's manifest is not upstream's migrations between the control migration and this baseline's two: $want" >&2; exit 1 ;;
esac
[ "$(applied "$scratch/migrate-Migration Apply.log")" = "$want" ] \
  || { echo "FAIL: the first apply applied '$(applied "$scratch/migrate-Migration Apply.log")', not '$want'" >&2; exit 1; }
echo "   applied all $(echo "$want" | wc -w | tr -d ' ') migrations, control first, upstream's 100–120, then 200 and 210"
run_job "$scratch/steps-migrate-again" "$mwork" stage "$scratch/migrate-again"
[ -z "$(applied "$scratch/migrate-again-Migration Apply.log")" ] \
  || { echo "FAIL: a second apply applied '$(applied "$scratch/migrate-again-Migration Apply.log")'" >&2; exit 1; }
echo "   a second apply applied nothing (the ledger holds $(psql "$pgurl" -XAtc 'select count(*) from _migrations.applied') migrations)"
key="$(psql "$pgurl" -XAtc "select value from app_private.secrets where name = 'better_auth_secret'")"
[[ "$key" =~ ^[0-9a-f]{64}$ ]] \
  || { echo "FAIL: migration 200 left no 64-hex Better Auth key in app_private.secrets" >&2; exit 1; }
tables="$(psql "$pgurl" -XAtc "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('chats','messages','parts','feedback','notes','files','user','session','account','verification','invitations','usage_grants','usage_events','additional_usage_interest')")"
[ "$tables" = 14 ] || { echo "FAIL: $tables of upstream's 14 tables are in public" >&2; exit 1; }
echo "   upstream's 14 tables, Better Auth's among them, and a generated Better Auth key outside public"
run_job "$scratch/steps-migrate-plan" "$mwork" stage "$scratch/migrate-plan"
[ "$(applied "$scratch/migrate-plan-Migration Plan.log")" = "$want" ] \
  || { echo "FAIL: the pull request's offline plan did not verify every migration" >&2; exit 1; }
echo "   the pull request's plan step verifies every migration's checksum offline"
unset SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD SUPABASE_DB_URL SUPABASE_API_URL
rm -rf "$mwork"

# ── 4. the web lane's steps, for stage ─────────────────────────────────────
echo "── the stage web lane: install, verify-app-structure, build-app, verify-build-output, deploy-dry-run"
extract_job "$scratch/plan-pr.json" web.stage.verify-deploy "$scratch/steps-web" \
  install-workspace-dependencies verify-app-structure build-app verify-build-output deploy-dry-run
work="$prtree/.orun/runs/e2e/web.stage.verify-deploy/work"
# The job's private tree, staged as orun stages it — no build output, no
# node_modules: under stack-tectonic 0.19.0 the job installs inside it.
python3 "$here/lib/stage-job.py" "$prtree" "$work"
[ ! -e "$work/apps/web/.open-next" ] && [ -f "$work/apps/web/wrangler.jsonc" ] \
  || { echo "FAIL: the staged tree is not a fresh checkout with the committed wrangler.jsonc" >&2; exit 1; }
echo "   staged: $(realpath --relative-to="$prtree" "$work") — no build output, the committed wrangler.jsonc"
# The stage wiring document, as the cloudflare-hyperdrive apply publishes it
# and the lane resolves it (secretEnv WIRING_CLOUDFLARE_HYPERDRIVE_STAGE).
hd_id="e2e0000000000000000000000000c0de"
export WIRING_CLOUDFLARE_HYPERDRIVE_STAGE="{\"hyperdrive_id\":\"$hd_id\",\"hyperdrive_name\":\"stg-$repo-stage\"}"
run_job "$scratch/steps-web" "$work" stage "$scratch/web"
unset WIRING_CLOUDFLARE_HYPERDRIVE_STAGE
build_log="$(ls "$scratch"/web-build-app.log)"
grep -q '(webpack)' "$build_log" \
  || { echo "FAIL: the staged build did not run on webpack (apps/web/package.json says why)" >&2; grep -m3 'Next.js' "$build_log" >&2; exit 1; }
grep -q "worker-secrets: not set, skipped: BOOTSTRAP_ADMIN_EMAIL" "$build_log" \
  || { echo "FAIL: build-app did not hand the owner's keys to worker-secrets.mjs" >&2; exit 1; }
grep -q "\"id\": \"$hd_id\"" "$work/apps/web/wrangler.jsonc" \
  || { echo "FAIL: build-app did not re-render wrangler.jsonc from the stage wiring document" >&2; exit 1; }
[ "$(node -e 'const fs=require("fs");process.stdout.write(String(fs.readdirSync(process.argv[1]).length))' "$work/node_modules")" -gt 0 ] && [ ! -L "$work/node_modules" ] \
  || { echo "FAIL: the job's install did not land inside its own tree" >&2; exit 1; }
echo "   the staged build ran on webpack, inside its own tree, bound to the stage Hyperdrive id it was handed, with no key to push"


# ── 5. serve it as it deploys: Better Auth, invite-only, no key ───────────
echo "── wrangler dev over the built Worker, as deployed: HYPERDRIVE on the local Postgres, no key of any kind"
[ ! -e "$work/apps/web/.dev.vars" ] || { echo "FAIL: the staged tree carries a .dev.vars" >&2; exit 1; }
# The config the build used, under the Worker name the stage deploy gives it.
# Written beside it, in the throwaway tree.
python3 - "$work/apps/web/wrangler.jsonc" "$work/apps/web/wrangler.e2e.json" "$repo-web-stage" <<'PY' \
  || { echo "FAIL: could not derive the dev config from the built one" >&2; exit 1; }
import json, sys
src, out, name = sys.argv[1:]
cfg = json.loads("\n".join(l for l in open(src).read().splitlines() if not l.lstrip().startswith("//")))
if cfg.get("vars") != {"AUTH_PROVIDER": "better-auth", "AUTH_SIGNUP_MODE": "invite"}:
    sys.exit(f"the built Worker's vars are {cfg.get('vars')}, not Better Auth with invite-only sign-up")
cfg.pop("$schema", None)
cfg["name"] = name
json.dump(cfg, open(out, "w"), indent=2)
PY
serve() { # LOG [--var KEY:VALUE …]
  local log="$1"; shift
  port="$(free_port)"
  (cd "$work/apps/web" && CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$pgurl" \
     exec setsid pnpm exec wrangler dev --config wrangler.e2e.json \
     --ip 127.0.0.1 --port "$port" --inspector-port "$(free_port)" \
     --show-interactive-dev-session=false "$@") > "$log" 2>&1 < /dev/null &
  dev_pid=$!
  url="http://127.0.0.1:$port"
  for _ in $(seq 1 90); do
    curl -s -o /dev/null "$url/api/health" && break
    kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$log" >&2; exit 1; }
    sleep 1
  done
  curl -s -o /dev/null "$url/api/health" || { echo "FAIL: wrangler dev never answered" >&2; tail -30 "$log" >&2; exit 1; }
}
serve "$scratch/dev.log"

echo "   ▸ the component's own smokeCommand, DEPLOYED_URL=$url"
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the product" >&2; tail -20 "$scratch/dev.log" >&2; exit 1; }

echo "   ▸ every route the product promises, as it deploys"
python3 "$here/lib/e2e-routes.py" deployed "$url" "$values" "$pgurl" \
  || { echo "FAIL: the routes; wrangler dev said:" >&2; tail -40 "$scratch/dev.log" >&2; exit 1; }
stop_group "$dev_pid"; dev_pid=""

# ── 6. given a model, it answers and keeps the chat ────────────────────────
echo "── the same Worker given a model (an OpenAI-compatible stand-in) as Worker variables, in upstream's anonymous mode"
model_port="$(free_port)"
setsid python3 "$here/lib/fake-openai.py" "$model_port" > "$scratch/model.log" 2>&1 < /dev/null &
model_pid=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$model_port/" && break; sleep 0.3; done
serve "$scratch/dev-chat.log" \
  --var AUTH_PROVIDER:none \
  --var OPENAI_COMPATIBLE_API_KEY:e2e-not-a-key \
  --var "OPENAI_COMPATIBLE_API_BASE_URL:http://127.0.0.1:$model_port/v1" \
  --var OPENAI_COMPATIBLE_MODELS:e2e-model
python3 "$here/lib/e2e-routes.py" chat "$url" "$values" "$pgurl" \
  || { echo "FAIL: the chat; wrangler dev said:" >&2; tail -40 "$scratch/dev-chat.log" >&2; exit 1; }
python3 - "$scratch/model.log" <<'PY' || { echo "FAIL: what the model was asked" >&2; tail -20 "$scratch/model.log" >&2; exit 1; }
import json, re, sys
calls = [json.loads(m.group(1)) for m in re.finditer(r"fake-openai (\{.*\})", open(sys.argv[1]).read())]
streamed = [c for c in calls if c["stream"]]
problems = []
if any(c["model"] != "e2e-model" or c["auth"] != "Bearer e2e-no" for c in calls):
    problems.append(f"a call did not ask for e2e-model with the key it was given: {calls}")
if len(streamed) != 1 or sorted(streamed[0]["tools"]) != ["editDraft", "fetch", "search"]:
    problems.append(f"the answer was not one streamed call offering the answer engine's tools: {streamed}")
for p in problems:
    print(f"  ✕ {p}", file=sys.stderr)
if problems:
    sys.exit(1)
print(f"   the model: {len(calls)} call(s), the answer streamed once with search, fetch and editDraft offered")
PY
stop_group "$dev_pid"; dev_pid=""

# ── 7. what Supabase's Data API would see ──────────────────────────────────
echo "── the Data API's roles (anon, authenticated) against the same database"
psql "$pgurl" -X -q -v ON_ERROR_STOP=1 -At > "$scratch/rls.out" 2> "$scratch/rls.err" <<'SQL' \
  || { echo "FAIL: the row-level security checks" >&2; cat "$scratch/rls.err" >&2; exit 1; }
SELECT 'app role: superuser=' || rolsuper || ' bypassrls=' || rolbypassrls FROM pg_roles WHERE rolname = current_user;
SELECT 'public tables without RLS: ' || count(*) FILTER (WHERE NOT c.relrowsecurity) || ' of ' || count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT 'not owned by the app: ' || count(*) FILTER (WHERE pg_get_userbyid(c.relowner) <> current_user)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT 'data api grants: ' || count(*) FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
SELECT 'app sees chats: ' || count(*) FROM chats;
SELECT 'app sees messages: ' || count(*) FROM messages;
SQL
sed 's/^/   /' "$scratch/rls.out"
grep -qx "app role: superuser=false bypassrls=false" "$scratch/rls.out" \
  && grep -qE "^public tables without RLS: 0 of [1-9][0-9]*$" "$scratch/rls.out" \
  && grep -qx "not owned by the app: 0" "$scratch/rls.out" \
  && grep -qx "data api grants: 0" "$scratch/rls.out" \
  || { echo "FAIL: the app's role, the tables' owner, their row-level security or the Data API's grants are not what migration 210 leaves" >&2; exit 1; }
for line in "app sees chats: 1" "app sees messages: 2"; do
  grep -qx "$line" "$scratch/rls.out" || { echo "FAIL: expected '$line'" >&2; exit 1; }
done
# Neither role can read the chat the app wrote, or write one: upstream's
# policies are written TO public, and would let both read a public chat —
# the privileges 210 revoked are what stops them.
psql "$pgurl" -X -q -At -c "UPDATE chats SET visibility = 'public'" > /dev/null
for role in anon authenticated; do
  for table in chats messages parts feedback session account; do
    if psql "$pgurl" -X -q -At -c "SET ROLE $role; SELECT count(*) FROM \"$table\"" > "$scratch/rls-read.log" 2>&1; then
      echo "FAIL: $role read $table through the Data API's grants" >&2; cat "$scratch/rls-read.log" >&2; exit 1
    fi
    grep -q "permission denied" "$scratch/rls-read.log" \
      || { echo "FAIL: $role's read of $table was refused for another reason:" >&2; cat "$scratch/rls-read.log" >&2; exit 1; }
  done
  if psql "$pgurl" -X -q -At -c "SET ROLE $role; INSERT INTO feedback (id, sentiment, message, page_url) VALUES ('$role', 'x', 'x', '/')" > "$scratch/rls-write.log" 2>&1; then
    echo "FAIL: $role wrote feedback through the Data API's grants" >&2; exit 1
  fi
  grep -q "permission denied" "$scratch/rls-write.log" \
    || { echo "FAIL: $role's write was refused for another reason:" >&2; cat "$scratch/rls-write.log" >&2; exit 1; }
done
echo "   anon and authenticated, granted what Supabase grants them, read nothing — not even a chat made public — and write nothing; the app reads and writes as its owner"

echo "e2e.test.sh: ok"
