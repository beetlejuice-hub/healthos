/**
 * Web Push, by hand, with WebCrypto only (runs in the Worker and in tests):
 *  - the message is encrypted for the phone (RFC 8291, "aes128gcm" — RFC 8188), so the push service
 *    (Apple, Google, Mozilla) only carries ciphertext;
 *  - the request is signed with our VAPID key (RFC 8292), so the push service knows it's us.
 * Tested against RFC 8291's own worked example (webpush.test.ts).
 */

const te = new TextEncoder();

export const b64u = {
  enc(b: ArrayBuffer | Uint8Array): string {
    const u = b instanceof Uint8Array ? b : new Uint8Array(b);
    let s = "";
    for (const x of u) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(s: string): Uint8Array<ArrayBuffer> {
    const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = atob(p), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

const cat = (...xs: Uint8Array[]) => { const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of xs) { out.set(x, o); o += x.length; } return out; };

/** HKDF-SHA256 (extract + expand) to `bytes` bytes. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, bytes * 8));
}

/** A P-256 private key from its raw `d` and uncompressed public point (65 bytes, 0x04|x|y). */
export async function importPrivate(d: Uint8Array, pub: Uint8Array, use: "ECDH" | "ECDSA"): Promise<CryptoKey> {
  const jwk = { kty: "EC", crv: "P-256", d: b64u.enc(d), x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), ext: true };
  return crypto.subtle.importKey("jwk", jwk, use === "ECDH" ? { name: "ECDH", namedCurve: "P-256" } : { name: "ECDSA", namedCurve: "P-256" }, false, use === "ECDH" ? ["deriveBits"] : ["sign"]);
}

export type Keys = { publicKey: Uint8Array; privateKey: CryptoKey };

/** A fresh P-256 ECDH pair, the public half raw (65 bytes). */
export async function ecdhPair(): Promise<Keys> {
  const k = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey)), privateKey: k.privateKey };
}

/**
 * Encrypt `plaintext` for one subscription (its `p256dh` public key and `auth` secret).
 * `server` and `salt` are fresh per message; tests pass the RFC's fixed ones.
 */
export async function encrypt(plaintext: Uint8Array, uaPublic: Uint8Array, authSecret: Uint8Array, server?: Keys, salt?: Uint8Array): Promise<Uint8Array> {
  const as = server ?? (await ecdhPair());
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const ua = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, cat(te.encode("WebPush: info\0"), uaPublic, as.publicKey), 32);
  const cek = await hkdf(s, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(s, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  // One record: the message, then the 0x02 "last record" delimiter.
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, cat(plaintext, new Uint8Array([2])) as BufferSource));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return cat(s, rs, new Uint8Array([as.publicKey.length]), as.publicKey, ct);
}

/** The phone's side (used by tests and the local check): decrypt an aes128gcm push body. */
export async function decrypt(body: Uint8Array, uaPrivate: CryptoKey, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<Uint8Array> {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const as = await crypto.subtle.importKey("raw", asPub as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: as }, uaPrivate, 256));
  const ikm = await hkdf(authSecret, shared, cat(te.encode("WebPush: info\0"), uaPublic, asPub), 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["decrypt"]);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, ct as BufferSource));
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  return padded.slice(0, end); // drop the delimiter
}

/** Our VAPID identity: an ECDSA P-256 pair, kept as JWK (private) + raw public (base64url). */
export type Vapid = { publicKey: string; jwk: JsonWebKey };

export async function newVapid(): Promise<Vapid> {
  const k = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return { publicKey: b64u.enc(await crypto.subtle.exportKey("raw", k.publicKey)), jwk: (await crypto.subtle.exportKey("jwk", k.privateKey)) as JsonWebKey };
}

/** The Authorization header for one push service: a short-lived ES256 JWT for its origin. */
export async function vapidAuth(endpoint: string, v: Vapid, subject: string, now = Date.now()): Promise<string> {
  const head = b64u.enc(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.enc(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u.enc(sig)}, k=${v.publicKey}`;
}

export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Send one message. Returns the push service's status (201 = accepted; 404/410 = gone for good). */
export async function sendPush(sub: Subscription, message: unknown, v: Vapid, subject: string, f: typeof fetch = fetch, ttlSec = 3600): Promise<number> {
  const body = await encrypt(te.encode(JSON.stringify(message)), b64u.dec(sub.keys.p256dh), b64u.dec(sub.keys.auth));
  const r = await f(sub.endpoint, {
    method: "POST",
    headers: { authorization: await vapidAuth(sub.endpoint, v, subject), "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: String(ttlSec), urgency: "normal" },
    body: body as BodyInit,
  });
  return r.status;
}
