#!/usr/bin/env python3
"""The routes the product promises, against the built Worker under wrangler dev.

  e2e-routes.py deployed <url> <values.json> <pgurl>   as it deploys: no key
  e2e-routes.py chat     <url> <values.json> <pgurl>   given a model (the stand-in)

Called by e2e.test.sh, which says what each Worker was given.
"""
import html, http.client, json, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request, uuid

mode, base, values, pgurl = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3])), sys.argv[4]
name = values["productname"]
problems = []


def bad(m):
    problems.append(m)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def req(path, data=None, headers=None, method=None, follow=True):
    # A GET whose CONNECTION drops (not one that answers an error) is asked
    # again, twice at most, and says so: `wrangler dev` on a loaded machine
    # has dropped one. A POST is never repeated — it would submit twice.
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    for attempt in range(3):
        r = urllib.request.Request(base + path, data=data, headers=headers or {}, method=method)
        try:
            with opener.open(r, timeout=120) as resp:
                return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read().decode(errors="replace")
        except urllib.error.HTTPError as e:
            return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode(errors="replace")
        except (http.client.RemoteDisconnected, ConnectionResetError) as e:
            if data is not None or attempt == 2:
                raise
            print(f"   (GET {path}: the connection dropped ({e.__class__.__name__}) — asking again)")
            time.sleep(1)


def sql(query):
    return subprocess.run(["psql", pgurl, "-XAtF", "\t", "-c", query],
                          capture_output=True, text=True, check=True).stdout.rstrip("\n")


def health():
    s, _, body = req("/api/health")
    try:
        return s, json.loads(body)
    except json.JSONDecodeError:
        return s, body


# The chat as the page sends it (lib/streaming: DefaultChatTransport's body,
# the model and search mode in the cookies the page sets).
def chat(text, chat_id, cookie=None):
    body = {"chatId": chat_id, "trigger": "submit-message", "isNewChat": True,
            "message": {"id": f"u-{uuid.uuid4().hex[:8]}", "role": "user", "parts": [{"type": "text", "text": text}]}}
    headers = {"content-type": "application/json"}
    if cookie:
        headers["cookie"] = cookie
    return req("/api/chat", json.dumps(body).encode(), headers, "POST")


if mode == "deployed":
    # ── the page, under the product's own name, with nothing connected ─────
    s, _, home = req("/")
    if s != 200:
        bad(f"/ answered {s}")
    title = re.search(r"<title>(.*?)</title>", home, re.S)
    if not title or html.unescape(title.group(1)) != name:
        bad(f"the page's <title> is {title and title.group(1)!r}, not {name!r}")
    if 'placeholder="Ask anything..."' not in home:
        bad("the page has no question input")
    if "No enabled model available" not in home:
        bad("the model picker does not say no model is connected")
    # The Open Graph image link is absolute, resolved against the origin the
    # build was given (component.yaml's NEXT_PUBLIC_SITE_URL, rebranded): the
    # product's own stage Worker — never upstream's hosted site.
    og = re.search(r'<meta property="og:image" content="([^"]+)"', home)
    want_origin = f"https://{values['reponame']}-web-stage.{values['subdomain']}.workers.dev/"
    if not og or not og.group(1).startswith(want_origin + "opengraph-image"):
        bad(f"the Open Graph image is {og and og.group(1)!r}, not on the stage origin {want_origin} the build was given")
    else:
        image = urllib.parse.urlsplit(html.unescape(og.group(1)))
        s, h, png = req(image.path + (f"?{image.query}" if image.query else ""))
        if s != 200 or not h.get("content-type", "").startswith("image/png") or not png:
            bad(f"the Open Graph image's path {image.path} answered {s} {h.get('content-type')}")

    # ── what only the Worker answers: the database, migrated ──────────────
    s, body = health()
    if s != 200 or body != {"ok": True, "database": True, "model": False, "search": False}:
        bad(f"/api/health answered {s} {body}")

    # ── Better Auth, invite-only: nobody can claim the instance ────────────
    s, _, signup = req("/auth/sign-up")
    if s != 200 or "Invitation required" not in signup or "invite-only" not in signup:
        bad(f"/auth/sign-up answered {s} without saying sign-up is invite-only")
    s, _, login = req("/auth/login")
    if s != 200 or "Sign in to your account" not in login:
        bad(f"/auth/login answered {s} without its form")
    s, h, _ = req("/library", follow=False)
    if s not in (302, 303, 307) or not h.get("location", "").split("?")[0].endswith("/auth/login"):
        bad(f"a signed-out /library answered {s} {h.get('location')!r}, not a redirect to /auth/login")
    s, _, refused = chat("Who are you?", f"e2e-{uuid.uuid4().hex[:8]}")
    if s != 401:
        bad(f"a signed-out chat answered {s} {refused[:120]!r}, not 401")
    s, _, _ = req("/api/no-such-route")
    if s != 404:
        bad(f"/api/no-such-route answered {s}, not 404")
    chats = sql("select count(*) from chats")
    if chats != "0":
        bad(f"serving the product wrote {chats} chat(s)")
    summary = (f"/ as {name!r} with no model connected, its Open Graph image on {want_origin}, /api/health, "
               "sign-up invite-only, a signed-out visitor sent to sign in and refused the chat, a 404")

elif mode == "chat":
    s, body = health()
    if s != 200 or body != {"ok": True, "database": True, "model": True, "search": False}:
        bad(f"/api/health answered {s} {body}, not a model connected")
    s, _, home = req("/")
    if "No enabled model available" in home:
        bad("the model picker still says no model is connected")
    chat_id = f"e2e{uuid.uuid4().hex[:12]}"
    question = "What is the capital of Atlantis?"
    s, h, raw = chat(question, chat_id, "selectedModel=openai-compatible:e2e-model; searchMode=quick")
    events = [json.loads(l[6:]) for l in raw.splitlines() if l.startswith("data: ") and l != "data: [DONE]"]
    answer = "".join(e.get("delta", "") for e in events if e.get("type") == "text-delta")
    errors = [e for e in events if e.get("type") in ("error", "tool-output-error", "tool-input-error")]
    if s != 200 or not h.get("content-type", "").startswith("text/event-stream"):
        bad(f"POST /api/chat answered {s} {h.get('content-type')}: {raw[:200]}")
    if errors:
        bad(f"POST /api/chat streamed errors: {errors}")
    if answer != "The e2e stand-in answered: Poseidonia is the capital of Atlantis.":
        bad(f"the chat answered {answer!r}")
    if not any(e.get("type") == "finish" and e.get("finishReason") == "stop" for e in events):
        bad("the stream never finished")
    # Kept: the chat, its two messages and their text, through Hyperdrive.
    row = sql(f"select user_id, visibility from chats where id = '{chat_id}'")
    if row != "anonymous-user\tprivate":
        bad(f"the chat row is {row!r}, not the anonymous user's private chat")
    roles = sql(f"select string_agg(role, ',' order by created_at) from messages where chat_id = '{chat_id}'")
    if roles != "user,assistant":
        bad(f"the chat's messages are {roles!r}, not the question and the answer")
    texts = sql(f"select string_agg(p.text_text, ' | ' order by m.created_at) from parts p join messages m on m.id = p.message_id "
                f"where m.chat_id = '{chat_id}' and p.type = 'text'")
    if texts != f"{question} | {answer}":
        bad(f"the stored text parts are {texts!r}")
    s, _, listing = req("/api/chats")
    try:
        listed = [c["id"] for c in json.loads(listing)["chats"]]
    except (json.JSONDecodeError, KeyError, TypeError):
        listed = []
    if s != 200 or chat_id not in listed:
        bad(f"/api/chats answered {s} without the chat: {listing[:200]}")
    summary = (f"a question answered through the chat route on the stand-in model, the chat and its two messages "
               f"kept in Postgres, and /api/chats listing it")
else:
    sys.exit(f"unknown mode {mode}")

if problems:
    for p in problems:
        print(f"  ✕ {p}", file=sys.stderr)
    sys.exit(1)
print(f"   {summary}")
