#!/usr/bin/env python3
"""A stand-in for an OpenAI-compatible chat completions API, for the e2e only.

The product reaches a vendor model with the owner's key; this machine has
neither, and a test must never call a real model. Pointed at by
OPENAI_COMPATIBLE_API_BASE_URL (and OPENAI_COMPATIBLE_MODELS, so the app never
asks for /v1/models), it answers every request the AI SDK's OpenAI-compatible
provider makes the way the API would: a streamed answer as server-sent events,
or one JSON completion, and whatever JSON object a structured-output request's
schema asks for, filled with placeholder strings. It never calls a tool, so the
answer engine answers without searching. Every request is logged, one JSON line
on stderr (`fake-openai {...}`), for the e2e to read back what it was asked.

  python3 fake-openai.py <port>
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ANSWER = "The e2e stand-in answered: Poseidonia is the capital of Atlantis."
MODEL = "e2e-model"


def fill(schema, depth=0):
    """A value of the shape a JSON schema asks for, with placeholder content."""
    if depth > 8 or not isinstance(schema, dict):
        return None
    for key in ("anyOf", "oneOf"):
        if key in schema:
            return fill(schema[key][0], depth + 1)
    kind = schema.get("type")
    if isinstance(kind, list):
        kind = next((k for k in kind if k != "null"), "null")
    if "enum" in schema:
        return schema["enum"][0]
    if kind == "object":
        props = schema.get("properties") or {}
        return {k: fill(v, depth + 1) for k, v in props.items()}
    if kind == "array":
        n = max(1, schema.get("minItems") or 1)
        return [fill(schema.get("items") or {"type": "string"}, depth + 1) for _ in range(n)]
    if kind in ("integer", "number"):
        return schema.get("minimum", 1)
    if kind == "boolean":
        return False
    if kind == "null":
        return None
    return "What else is known about Atlantis?"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet: the request log below is the record
        pass

    def send_json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.rstrip("/").endswith("/models"):
            return self.send_json(200, {"object": "list", "data": [{"id": MODEL, "object": "model"}]})
        self.send_json(200, {"ok": True})

    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        try:
            req = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self.send_json(400, {"error": {"message": "not JSON"}})
        if not self.path.rstrip("/").endswith("/chat/completions"):
            return self.send_json(404, {"error": {"message": f"no route {self.path}"}})
        fmt = req.get("response_format") or {}
        schema = (fmt.get("json_schema") or {}).get("schema") if fmt.get("type") == "json_schema" else None
        content = json.dumps(fill(schema)) if schema else (json.dumps({}) if fmt.get("type") == "json_object" else ANSWER)
        print("fake-openai " + json.dumps({
            "model": req.get("model"),
            "stream": bool(req.get("stream")),
            "tools": sorted(t.get("function", {}).get("name", "") for t in (req.get("tools") or [])),
            "structured": fmt.get("type"),
            "auth": (self.headers.get("authorization") or "")[:13],
        }), file=sys.stderr, flush=True)
        usage = {"prompt_tokens": 12, "completion_tokens": 9, "total_tokens": 21}
        if not req.get("stream"):
            return self.send_json(200, {
                "id": "chatcmpl-e2e", "object": "chat.completion", "created": 0, "model": MODEL,
                "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                "usage": usage,
            })
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.end_headers()

        def event(delta, finish=None, with_usage=False):
            chunk = {"id": "chatcmpl-e2e", "object": "chat.completion.chunk", "created": 0, "model": MODEL,
                     "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
            if with_usage:
                chunk["usage"] = usage
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            self.wfile.flush()

        event({"role": "assistant", "content": ""})
        words = content.split(" ")
        for i, word in enumerate(words):
            event({"content": word + (" " if i < len(words) - 1 else "")})
        event({}, finish="stop", with_usage=True)
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
