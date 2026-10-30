import { createLoginMessage, type SiweLoginPayload } from "../../../apps/web/src/lib/auth/siwe";
import { rpc } from "./chain";
const base = "http://localhost:4012";
export async function login(address: string) {
  const nonce = await fetch(`${base}/api/auth/nonce?address=${encodeURIComponent(address)}`);
  if (!nonce.ok) throw new Error(`Nonce failed: ${nonce.status}`);
  const payload = await nonce.json() as SiweLoginPayload;
  const message = createLoginMessage(payload);
  const signature = await rpc<string>("personal_sign", [`0x${Buffer.from(message).toString("hex")}`, address]);
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload, signature }) });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { response, cookie, payload };
}
