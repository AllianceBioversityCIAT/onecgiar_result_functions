import assert from "node:assert/strict";
import { describe, it } from "node:test";

import app from "../src/server.mjs";
import { AUTH_REQUEST_KEY } from "../src/auth/constants.mjs";

/**
 * P2-3228 — the forwarding routes (`/version`, `/webhook`) must answer, not crash.
 *
 * `/version` shipped in 04a35c6 calling `versionClientFor`, a helper nobody wrote. The call sits
 * before the handler's `try`, so the ReferenceError escaped the async handler: Express 4 never
 * turned it into a response, the Lambda died, and every caller got API Gateway's bare
 * `{"message":"Internal Server Error"}` instead of ours. The endpoint was published with nine
 * documented status codes and could not return any of them.
 *
 * Nothing caught it because the identifier is only resolved when the line runs, and no test ever
 * ran it — a request that failed validation returned 400 from *above* the broken line, so the
 * route looked alive.
 *
 * So what these tests pin is deliberately weak on content and strict on the one thing that broke:
 * the handler returns a response of our own shape rather than throwing. They call the handler
 * directly, past `requireApiKey`, because reaching it through HTTP needs CLARISA.
 */
function handlerFor(method, path) {
  const layer = app._router.stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  assert.ok(layer, `no ${method.toUpperCase()} ${path} route is registered`);
  // The last handler in the stack is the route's own; the ones before it are middleware.
  return layer.route.stack.at(-1).handle;
}

function fakeReq(body) {
  return {
    headers: { "x-request-id": "forwarding-routes-test" },
    body,
    [AUTH_REQUEST_KEY]: { apiKey: "test-key", id: 34, acronym: "STAR" },
  };
}

function fakeRes() {
  const sent = {};
  return {
    sent,
    status(code) {
      sent.status = code;
      return this;
    },
    json(payload) {
      sent.body = payload;
      return this;
    },
  };
}

async function call(method, path, body) {
  const res = fakeRes();
  await handlerFor(method, path)(fakeReq(body), res);
  return res.sent;
}

describe("forwarding routes answer instead of throwing", () => {
  it("POST /version responds for a well-formed result_code", async () => {
    const sent = await call("post", "/version", { result_code: "8455" });

    assert.ok(sent.status, "the handler must send a response, not throw");
    assert.equal(
      sent.body.ok,
      false,
      "no Reporting URL is configured under test, so this is the failure path",
    );
    assert.equal(
      sent.body.result_code,
      "8455",
      "the code has to come back so a caller can match the failure to its request",
    );
    assert.ok(
      sent.body.requestId,
      "our own error shape carries a requestId; API Gateway's bare 500 does not",
    );
  });

  it("POST /version still rejects a missing result_code with 400", async () => {
    const sent = await call("post", "/version", {});

    assert.equal(sent.status, 400);
    assert.equal(sent.body.error, "validation_failed");
  });

  it("POST and GET /webhook respond too", async () => {
    for (const [method, body] of [
      ["post", { url: "https://example.org/hook" }],
      ["get", undefined],
    ]) {
      const sent = await call(method, "/webhook", body);
      assert.ok(
        sent.status,
        `${method.toUpperCase()} /webhook must send a response, not throw`,
      );
      assert.ok(sent.body.requestId);
    }
  });
});
