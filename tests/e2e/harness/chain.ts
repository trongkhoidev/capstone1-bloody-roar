export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json() as { result?: T; error?: { message: string } };
  if (body.error || body.result === undefined) throw new Error(`RPC ${method}: ${body.error?.message ?? "missing result"}`);
  return body.result;
}
