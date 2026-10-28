#!/usr/bin/env bash
# THE REBRAND WRITES EACH VALUE ONCE, AND WHAT IT WROTE STAYS WRITTEN.
#
# Drives the real tooling/rebrand/rebrand.mjs over one-file trees and compares
# the file. Each case is a shape this baseline's identity actually takes in the
# tree — the name seam, the worker name, the Worker's own origin, the
# placeholder domain, a secret ref, the `repo` the Supabase project is named
# after, the product's environment variables — and each runs through as many
# passes as a bootstrap might make, so a value written once must survive every
# later pass unchanged. Two things must NOT be renamed although they spell the
# slug: the upstream's own identity (the template's name is this baseline's
# slug, and its repository is where the release check reads releases from),
# and a migration (its checksum is in the manifest and in every database it
# was applied to).
#
# The identity is PINNED (fixtures/baseline-identity.morphic.json) rather
# than read from .baseline/identity.json: what this tests is the engine, and
# its fixtures spell the identity out literally.
#
# Needs: node, git. No network.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
rebrand="$here/../tooling/rebrand/rebrand.mjs"
identity="$here/fixtures/baseline-identity.morphic.json"

fail=0
# check NAME VALUES-JSON FILE CONTENT WANT [PASSES]
check() {
  local name="$1" values="$2" file="$3" content="$4" want="$5" passes="${6:-1}"
  local tmp got out i
  tmp="$(mktemp -d)"
  git -C "$tmp" init -q
  mkdir -p "$tmp/$(dirname "$file")" "$tmp/.rebrand"
  printf '%s\n' "$content" > "$tmp/$file"
  printf '%s\n' "$values" > "$tmp/.rebrand/values.json"
  for ((i = 1; i <= passes; i++)); do
    git -C "$tmp" add -A
    if ! out="$(cd "$tmp" && node "$rebrand" --baseline-identity "$identity" --values .rebrand/values.json --allow-dirty 2>&1)"; then
      echo "   ✕  $name: rebrand pass $i failed:" >&2
      printf '%s\n' "$out" | sed 's/^/        /' >&2
      fail=1
      rm -rf "$tmp"
      return
    fi
  done
  got="$(cat "$tmp/$file")"
  rm -rf "$tmp"
  if [ "$got" = "$want" ]; then
    echo "   ok  $name"
  else
    echo "   ✕  $name:" >&2
    echo "        got:  $got" >&2
    echo "        want: $want" >&2
    fail=1
  fi
}

acme='{"reponame":"acme-search","productname":"Acme Answers","productdomain":"acme.dev","githuborg":"acme-inc","subdomain":"acme","orunWorkspace":"ws_79BDXAZQ"}'
seam='export const SITE_NAME = "Morphic"'

echo "── rebrand: the product's own identity"
check "the name seam takes the product's name" \
  "$acme" apps/web/lib/site.ts "$seam" \
  'export const SITE_NAME = "Acme Answers"'
check "…and stays a valid string for a name with an apostrophe and an ampersand" \
  '{"reponame":"sams-notes","productname":"Sam'"'"'s Notes & Answers","productdomain":"sam.dev"}' \
  apps/web/lib/site.ts "$seam" \
  'export const SITE_NAME = "Sam'"'"'s Notes & Answers"'
check "the product's environment variables take its prefix" \
  "$acme" apps/web/app/page.tsx "  const isCloudDeployment = process.env.MORPHIC_CLOUD_DEPLOYMENT === 'true'" \
  "  const isCloudDeployment = process.env.ACME_SEARCH_CLOUD_DEPLOYMENT === 'true'"
check "…in its docs too" \
  "$acme" README.md 'Set `MORPHIC_UPDATE_CHECK_DISABLED=true` to turn the release check off.' \
  'Set `ACME_SEARCH_UPDATE_CHECK_DISABLED=true` to turn the release check off.'
check "the worker name is re-prefixed, the environment suffix kept" \
  "$acme" apps/web/component.yaml 'workerName: morphic-web' \
  'workerName: acme-search-web'
check "the Worker's own origin: worker name and subdomain" \
  "$acme" intent.yaml \
  '    url: https://morphic-web-stage.your-workers-subdomain.workers.dev' \
  '    url: https://acme-search-web-stage.acme.workers.dev'
check "the site URL the build bakes in (the Open Graph link): worker name and subdomain" \
  "$acme" apps/web/component.yaml \
  'buildCommand: NEXT_PUBLIC_SITE_URL="${SITE_URL:-https://morphic-web-${ORUN_ENVIRONMENT}.your-workers-subdomain.workers.dev}" pnpm build' \
  'buildCommand: NEXT_PUBLIC_SITE_URL="${SITE_URL:-https://acme-search-web-${ORUN_ENVIRONMENT}.acme.workers.dev}" pnpm build'
check "the placeholder domain is the product's domain, not a renamed slug" \
  "$acme" intent.yaml '      BASE_DOMAIN: morphic.example.com' \
  '      BASE_DOMAIN: acme.dev'
check "no domain given: the reserved placeholder, for an owner to replace later" \
  '{"reponame":"acme-search","productname":"Acme Answers","githuborg":"acme-inc","subdomain":"acme"}' \
  intent.yaml '      BASE_DOMAIN: morphic.example.com' \
  '      BASE_DOMAIN: acme-search.example.com'
check "an empty domain is no domain" \
  '{"reponame":"acme-search","productname":"Acme Answers","productdomain":""}' \
  intent.yaml '      BASE_DOMAIN: morphic.example.com' \
  '      BASE_DOMAIN: acme-search.example.com'
check "the repo slug" \
  "$acme" package.json '  "name": "morphic",' \
  '  "name": "acme-search",'
check "the repo Terraform names the Supabase project and Hyperdrive config after" \
  "$acme" intent.yaml '        repo: morphic' \
  '        repo: acme-search'
check "the fixture's Hyperdrive name follows it" \
  "$acme" apps/web/wiring.fixture.json '    "hyperdrive_name": "stg-morphic-stage"' \
  '    "hyperdrive_name": "stg-acme-search-stage"'
check "a secret ref names the product's workspace and project" \
  "$acme" infra/db-migrate/component.yaml \
  '    SUPABASE_ACCESS_TOKEN: "secret://morphic/morphic/{{ .environment }}/SUPABASE_ACCESS_TOKEN"' \
  '    SUPABASE_ACCESS_TOKEN: "secret://ws_79BDXAZQ/acme-search/{{ .environment }}/SUPABASE_ACCESS_TOKEN"'
check "this repository's source link names the product's owner and repository" \
  "$acme" README.md 'See https://github.com/sourceplane/morphic.' \
  'See https://github.com/acme-inc/acme-search.'
check "org-owned identity is not renamed" \
  "$acme" intent.yaml 'apiVersion: sourceplane.io/v1 # mail ops@sourceplane.ai' \
  'apiVersion: sourceplane.io/v1 # mail ops@sourceplane.ai'

echo "── rebrand: what spells the slug and is not this baseline's"
check "the upstream repository the release check reads is upstream's" \
  "$acme" apps/web/lib/version/config.ts "const DEFAULT_REPO = 'miurla/morphic'" \
  "const DEFAULT_REPO = 'miurla/morphic'"
check "…and so is the short link to it in the sidebar's menu" \
  "$acme" apps/web/components/external-link-items.tsx "    href: 'https://git.new/morphic'," \
  "    href: 'https://git.new/morphic',"
check "a migration is never rewritten (its checksum is in the manifest)" \
  "$acme" packages/db/src/migrations/030_x/up.sql '-- morphic: a comment the checksum covers' \
  '-- morphic: a comment the checksum covers'
check "nor is its drizzle-kit twin" \
  "$acme" apps/web/drizzle/0022_x.sql '-- morphic: a comment the checksum covers' \
  '-- morphic: a comment the checksum covers'

echo "── rebrand: a written value is not rewritten, in any later pass"
contains='{"reponame":"morphic-2","productname":"Morphic 2","productdomain":"morphic.example.com.au","githuborg":"sourceplane","subdomain":"your-workers-subdomain-2"}'
check "a repo slug containing the baseline's slug survives three passes" \
  "$contains" package.json '  "name": "morphic",' \
  '  "name": "morphic-2",' 3
check "a worker name built on it survives three passes" \
  "$contains" apps/web/component.yaml 'workerName: morphic-web' \
  'workerName: morphic-2-web' 3
check "a domain containing the baseline's domain survives three passes" \
  "$contains" intent.yaml 'BASE_DOMAIN: morphic.example.com' \
  'BASE_DOMAIN: morphic.example.com.au' 3
check "a subdomain containing the placeholder survives three passes" \
  "$contains" apps/web/component.yaml 'workersDevSubdomain: your-workers-subdomain' \
  'workersDevSubdomain: your-workers-subdomain-2' 3
check "a name containing the baseline's name survives three passes" \
  "$contains" apps/web/lib/site.ts "$seam" \
  'export const SITE_NAME = "Morphic 2"' 3
check "an environment variable on a prefix containing the baseline's survives three passes" \
  "$contains" apps/web/lib/version/config.ts '  const disabled = env.MORPHIC_UPDATE_CHECK_DISABLED === '"'"'true'"'"'' \
  '  const disabled = env.MORPHIC_2_UPDATE_CHECK_DISABLED === '"'"'true'"'"'' 3

# --verify runs after every rebrand. Without the product's values it cannot
# tell the product's own identity from a leftover; with them it can. A real
# leftover must fail it either way.
verify() { # NAME VALUES FILE CONTENT WANT(pass|fail) [--values]
  local name="$1" values="$2" file="$3" content="$4" want="$5" withvalues="${6:-}" tmp got
  tmp="$(mktemp -d)"
  git -C "$tmp" init -q
  mkdir -p "$tmp/$(dirname "$file")" "$tmp/.rebrand"
  printf '%s\n' "$content" > "$tmp/$file"
  printf '%s\n' "$values" > "$tmp/.rebrand/values.json"
  git -C "$tmp" add -A
  if (cd "$tmp" && node "$rebrand" --baseline-identity "$identity" --verify ${withvalues:+--values .rebrand/values.json} >/dev/null 2>&1); then got=pass; else got=fail; fi
  rm -rf "$tmp"
  if [ "$got" = "$want" ]; then echo "   ok  $name"; else echo "   ✕  $name: --verify ${got}ed, want $want" >&2; fail=1; fi
}
echo "── rebrand --verify: the product's own identity is not residue"
verify "given the values, a slug containing the baseline's passes" \
  "$contains" package.json '"name": "morphic-2"' pass --values
verify "without them it cannot know, and fails" \
  "$contains" package.json '"name": "morphic-2"' fail
verify "given the values, a real leftover still fails" \
  "$acme" package.json '"name": "morphic"' fail --values
verify "a leftover worker name fails" \
  "$acme" apps/web/component.yaml 'workerName: morphic-web' fail --values
verify "a leftover code identifier fails (no rule renames it — so nothing may spell it)" \
  "$acme" apps/web/app/x.ts 'export class Morphic {}' fail --values
verify "upstream's repository is not residue" \
  "$acme" apps/web/lib/version/config.ts "const DEFAULT_REPO = 'miurla/morphic'" pass --values
verify "nor is its short link" \
  "$acme" apps/web/components/external-link-items.tsx "href: 'https://git.new/morphic'," pass --values
verify "a leftover environment variable fails" \
  "$acme" apps/web/app/page.tsx "process.env.MORPHIC_CLOUD_DEPLOYMENT" fail --values
verify "a clean product passes" \
  "$acme" package.json '"name": "acme-search"' pass --values

echo "── rebrand: a residue it cannot rename fails the rebrand itself"
tmp="$(mktemp -d)"; git -C "$tmp" init -q; mkdir -p "$tmp/.rebrand" "$tmp/apps/web"
printf '%s\n' "$acme" > "$tmp/.rebrand/values.json"
# The pascal form has no rule (the product's name in code reads the seam), so
# a file that spells it must stop the rebrand.
printf 'const title = "Morphic"\n' > "$tmp/apps/web/x.ts"
git -C "$tmp" add -A
if out="$(cd "$tmp" && node "$rebrand" --baseline-identity "$identity" --values .rebrand/values.json --allow-dirty 2>&1)"; then
  echo "   ✕  the template's name spelled outside the seam passed the rebrand" >&2; fail=1
elif ! printf '%s\n' "$out" | grep -q "apps/web/x.ts"; then
  echo "   ✕  the rebrand failed without naming the file" >&2; fail=1
else
  echo "   ok  the template's name spelled outside the seam fails the rebrand, naming the file"
fi
rm -rf "$tmp"

[ "$fail" -eq 0 ] || exit 1
echo "rebrand.test.sh: ok"
