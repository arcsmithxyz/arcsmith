/**
 * Posts to X with the v2 API, signed with OAuth 1.0a user context (the app's keys plus the
 * posting account's access token). Uses Web Crypto only, so it runs in Workers and Node.
 */
export type XCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
};

const ENDPOINT = "https://api.x.com/2/tweets";

/** RFC 3986 percent-encoding, which OAuth 1.0a requires (encodeURIComponent leaves !'()* alone). */
function percent(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function hmacSha1Base64(key: string, message: string) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function authorization(method: string, url: string, credentials: XCredentials) {
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };
  // A JSON body is not part of the signature; only the oauth_* parameters are.
  const parameters = Object.keys(oauth)
    .sort()
    .map((k) => `${percent(k)}=${percent(oauth[k])}`)
    .join("&");
  const base = [method.toUpperCase(), percent(url), percent(parameters)].join("&");
  const signingKey = `${percent(credentials.apiSecret)}&${percent(credentials.accessSecret)}`;
  oauth.oauth_signature = await hmacSha1Base64(signingKey, base);
  return `OAuth ${Object.keys(oauth)
    .sort()
    .map((k) => `${percent(k)}="${percent(oauth[k])}"`)
    .join(", ")}`;
}

export type PostResult = { ok: true; id: string } | { ok: false; duplicate: boolean; status: number; message: string };

export async function postToX(text: string, credentials: XCredentials): Promise<PostResult> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: await authorization("POST", ENDPOINT, credentials), "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: { id: string }; detail?: string; title?: string };
  if (response.ok && body.data) return { ok: true, id: body.data.id };
  const message = body.detail ?? body.title ?? `X answered ${response.status}`;
  // X refuses identical text twice; for this bot that means the post already went out.
  return { ok: false, duplicate: /duplicate/i.test(message), status: response.status, message };
}

/** Credentials from Worker secrets / environment variables, or null when any is missing. */
export function credentialsFrom(env: Record<string, unknown>): XCredentials | null {
  const read = (name: string) => (typeof env[name] === "string" && env[name] ? (env[name] as string) : null);
  const apiKey = read("X_API_KEY");
  const apiSecret = read("X_API_SECRET");
  const accessToken = read("X_ACCESS_TOKEN");
  const accessSecret = read("X_ACCESS_SECRET");
  return apiKey && apiSecret && accessToken && accessSecret ? { apiKey, apiSecret, accessToken, accessSecret } : null;
}
