import { describe, expect, it } from "vitest";
import { b64u, decrypt, encrypt, importPrivate, newVapid, sendPush, vapidAuth } from "./webpush";

// RFC 8291, Appendix A — the worked example, byte for byte.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("Web Push encryption (RFC 8291)", () => {
  it("matches the RFC's example exactly", async () => {
    const asPub = b64u.dec(RFC.asPublic);
    const server = { publicKey: asPub, privateKey: await importPrivate(b64u.dec(RFC.asPrivate), asPub, "ECDH") };
    const out = await encrypt(new TextEncoder().encode(RFC.plaintext), b64u.dec(RFC.uaPublic), b64u.dec(RFC.auth), server, b64u.dec(RFC.salt));
    expect(b64u.enc(out)).toBe(RFC.body);
  });

  it("the phone side decrypts it back (RFC body and a fresh one)", async () => {
    const uaPub = b64u.dec(RFC.uaPublic), ua = await importPrivate(b64u.dec(RFC.uaPrivate), uaPub, "ECDH");
    expect(new TextDecoder().decode(await decrypt(b64u.dec(RFC.body), ua, uaPub, b64u.dec(RFC.auth)))).toBe(RFC.plaintext);
    const fresh = await encrypt(new TextEncoder().encode("How now?"), uaPub, b64u.dec(RFC.auth));
    expect(new TextDecoder().decode(await decrypt(fresh, ua, uaPub, b64u.dec(RFC.auth)))).toBe("How now?");
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs an ES256 JWT for the push service's origin, verifiable with our public key", async () => {
    const v = await newVapid();
    const h = await vapidAuth("https://web.push.apple.com/abc123", v, "https://healthos.lukacsarnold9.workers.dev", Date.UTC(2026, 9, 2));
    const [, t, k] = h.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(v.publicKey);
    const [head, claims, sig] = t.split(".");
    const c = JSON.parse(new TextDecoder().decode(b64u.dec(claims)));
    expect(c).toMatchObject({ aud: "https://web.push.apple.com", sub: "https://healthos.lukacsarnold9.workers.dev" });
    expect(c.exp - Date.UTC(2026, 9, 2) / 1000).toBe(12 * 3600);
    const pub = await crypto.subtle.importKey("raw", b64u.dec(k), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64u.dec(sig), new TextEncoder().encode(`${head}.${claims}`))).toBe(true);
  });

  it("sendPush posts ciphertext the subscriber can read, with the right headers", async () => {
    const v = await newVapid();
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const uaPub = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
    let got: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => { got = { url, init }; return new Response(null, { status: 201 }); }) as unknown as typeof fetch;
    const status = await sendPush({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: b64u.enc(uaPub), auth: b64u.enc(auth) } }, { title: "How now?", url: "/#today" }, v, "https://app", f);
    expect(status).toBe(201);
    const hdr = got!.init.headers as Record<string, string>;
    expect(hdr["content-encoding"]).toBe("aes128gcm");
    expect(hdr.authorization).toMatch(/^vapid t=.+, k=/);
    const plain = await decrypt(got!.init.body as Uint8Array, ua.privateKey, uaPub, auth);
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual({ title: "How now?", url: "/#today" });
  });
});
