import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describeXError, oauth1AuthorizationHeader } from "../../src/lib/auth/oauth1.js";

const CONSUMER_KEY = "ck";
const CONSUMER_SECRET = "cs";
const CALLBACK = "https://cloakpay.example/api/auth/x/callback";
const REQUEST_TOKEN_URL = "https://api.x.com/oauth/request_token";

/**
 * The signature base string, written out by hand.
 *
 * Deriving this from the implementation would make the test agree with any bug.
 * X is the real judge, and `npm run auth:check` asks it for a request token; this
 * pins the ordering and the encoding so a break is caught before a redirect.
 */
const EXPECTED_PARAMETERS =
  "oauth_callback=https%3A%2F%2Fcloakpay.example%2Fapi%2Fauth%2Fx%2Fcallback" +
  "&oauth_consumer_key=ck" +
  "&oauth_nonce=nonce123" +
  "&oauth_signature_method=HMAC-SHA1" +
  "&oauth_timestamp=1700000000" +
  "&oauth_version=1.0";

function percentEncode(value) {
  return encodeURIComponent(value).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const EXPECTED_BASE = [
  "POST",
  "https%3A%2F%2Fapi.x.com%2Foauth%2Frequest_token",
  percentEncode(EXPECTED_PARAMETERS),
].join("&");

function headerParameters(header) {
  assert.match(header, /^OAuth /);
  const parameters = new Map();
  for (const part of header.replace(/^OAuth /, "").split(", ")) {
    const [name, quoted] = part.split("=");
    parameters.set(decodeURIComponent(name), decodeURIComponent(quoted.replace(/^"|"$/g, "")));
  }
  return parameters;
}

const REQUEST = {
  method: "POST",
  url: REQUEST_TOKEN_URL,
  consumerKey: CONSUMER_KEY,
  consumerSecret: CONSUMER_SECRET,
  extraParams: { oauth_callback: CALLBACK },
  nonce: "nonce123",
  timestamp: "1700000000",
};

test("the signature is the HMAC-SHA1 of the hand-written base string", () => {
  const expected = createHmac("sha1", `${percentEncode(CONSUMER_SECRET)}&`)
    .update(EXPECTED_BASE)
    .digest("base64");
  const header = oauth1AuthorizationHeader(REQUEST);
  assert.equal(headerParameters(header).get("oauth_signature"), expected);
});

test("the header carries every parameter X requires, and nothing else", () => {
  const parameters = headerParameters(oauth1AuthorizationHeader(REQUEST));
  assert.deepEqual(
    [...parameters.keys()].sort(),
    [
      "oauth_callback",
      "oauth_consumer_key",
      "oauth_nonce",
      "oauth_signature",
      "oauth_signature_method",
      "oauth_timestamp",
      "oauth_version",
    ],
  );
  assert.equal(parameters.get("oauth_signature_method"), "HMAC-SHA1");
  assert.equal(parameters.get("oauth_callback"), CALLBACK);
  // The request-token step must not carry a token: X reads the presence of
  // oauth_token as "this is an authorised request".
  assert.equal(parameters.has("oauth_token"), false);
});

test("an access-token step signs with the request token and its secret", () => {
  const withToken = oauth1AuthorizationHeader({
    ...REQUEST,
    url: "https://api.x.com/oauth/access_token",
    token: "req-token",
    tokenSecret: "req-secret",
    extraParams: { oauth_verifier: "verifier" },
  });
  assert.equal(headerParameters(withToken).get("oauth_token"), "req-token");

  // Same request without the token secret is a different signature: that secret
  // is what proves the caller is the one who started the handshake.
  const wrongSecret = oauth1AuthorizationHeader({
    ...REQUEST,
    url: "https://api.x.com/oauth/access_token",
    token: "req-token",
    tokenSecret: "not-the-secret",
    extraParams: { oauth_verifier: "verifier" },
  });
  assert.notEqual(
    headerParameters(withToken).get("oauth_signature"),
    headerParameters(wrongSecret).get("oauth_signature"),
  );
});

test("everything that is signed changes the signature", () => {
  const signatureOf = (input) => headerParameters(oauth1AuthorizationHeader(input)).get("oauth_signature");
  const base = signatureOf(REQUEST);

  const mutations = {
    method: { method: "GET" },
    url: { url: "https://api.x.com/oauth/access_token" },
    consumerKey: { consumerKey: "other-key" },
    consumerSecret: { consumerSecret: "other-secret" },
    extraParam: { extraParams: { oauth_callback: "https://elsewhere.example/callback" } },
    nonce: { nonce: "nonce124" },
    timestamp: { timestamp: "1700000001" },
  };

  for (const [name, mutation] of Object.entries(mutations)) {
    assert.notEqual(signatureOf({ ...REQUEST, ...mutation }), base, `${name} is not covered by the signature`);
  }
});

test("query parameters are signed too, so a URL cannot be edited in flight", () => {
  const signatureOf = (url) =>
    headerParameters(oauth1AuthorizationHeader({ ...REQUEST, method: "GET", url })).get("oauth_signature");
  assert.notEqual(
    signatureOf("https://api.x.com/2/users/me?user.fields=name"),
    signatureOf("https://api.x.com/2/users/me?user.fields=profile_image_url,name,username"),
  );
});

test("X's refusals are reported in its own words, in each of its shapes", () => {
  // An unapproved callback URL: XML, and the sentence that names the fix.
  assert.equal(
    describeXError(
      '<?xml version="1.0" encoding="UTF-8"?><errors><error code="415">Callback URL not approved for this client application. Approved callback URLs can be adjusted in your application settings</error></errors>',
    ),
    "415: Callback URL not approved for this client application. Approved callback URLs can be adjusted in your application settings",
  );
  // The 1.0a endpoints use this shape when a signature is rejected.
  assert.equal(
    describeXError('{"errors":[{"code":32,"message":"Could not authenticate you."}]}'),
    "Could not authenticate you.",
  );
  // The v2 lookups use title/detail, which is the 403 the OAuth 2.0 path gets.
  assert.equal(describeXError('{"title":"Forbidden","detail":"Forbidden"}'), "Forbidden - Forbidden");
  assert.equal(describeXError("error=invalid_token"), "invalid_token");
  assert.equal(describeXError("   "), "no readable body");
});

test("values are escaped the way RFC 5849 requires", () => {
  const raw = "https://cloakpay.example/a b!*'()~/x";
  const header = oauth1AuthorizationHeader({ ...REQUEST, extraParams: { oauth_callback: raw } });

  // `!*'()` must be escaped even though encodeURIComponent leaves them alone,
  // `~` must not be, and everything else is the usual percent-encoding.
  assert.ok(
    header.includes('oauth_callback="https%3A%2F%2Fcloakpay.example%2Fa%20b%21%2A%27%28%29~%2Fx"'),
    `unexpected encoding: ${header}`,
  );
  // And the escaping is reversible, so nothing is silently mangled on the way in.
  assert.equal(headerParameters(header).get("oauth_callback"), raw);
});
