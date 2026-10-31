import { createLoginMessage, type SiweLoginPayload } from "../../../apps/web/src/lib/auth/siwe";
import { rpc } from "./chain";
import { randomTestIp } from "./ip";
const base = "http://localhost:4012";
export async function login(address: string) {
  const ip = randomTestIp();
  const requestNonce = () => fetch(`${base}/api/auth/nonce?address=${encodeURIComponent(address)}`, { headers: { "x-forwarded-for": ip } });
  // Next dev recompiles a route that sat idle; a request that lands in that window gets 404, so retry it a few times.
  let nonce = await requestNonce();
  for (let attempt = 0; nonce.status === 404 && attempt < 5; attempt += 1) {
    await Bun.sleep(2_000);
    nonce = await requestNonce();
  }
  if (!nonce.ok) throw new Error(`Nonce failed: ${nonce.status}`);
  const payload = await nonce.json() as SiweLoginPayload;
  const message = createLoginMessage(payload);
  const signature = await rpc<string>("personal_sign", [`0x${Buffer.from(message).toString("hex")}`, address]);
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ payload, signature }) });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { response, cookie, payload };
}
