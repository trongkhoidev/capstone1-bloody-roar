// Role/route smoke test against a running server (local or production).
//   BASE_URL=https://<domain> SMOKE_ADMIN_KEY=0x<key of a wallet listed in ADMIN_WALLETS> \
//   bun run scripts/smoke-roles.ts
// Client and developer use fresh random wallets. Without SMOKE_ADMIN_KEY the admin checks are skipped.
// Note: each run creates two throwaway users (and one issue) in the target database.
import { signLoginPayload } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { randomBytes } from "node:crypto";

const base = (process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function login(privateKey: string) {
  const wallet = new PrivateKeyWallet(privateKey);
  const address = await wallet.getAddress();
  const nonceRes = await fetch(`${base}/api/auth/nonce?address=${address}`);
  if (!nonceRes.ok) throw new Error(`nonce failed: ${nonceRes.status}`);
  const signed = await signLoginPayload({ payload: await nonceRes.json(), wallet });
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signed),
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const { user } = (await res.json()) as { user: { role: string } };
  return { cookie, role: user.role };
}

async function gql(cookie: string | null, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`${base}/api/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as { data?: any; errors?: { message: string; extensions?: { code?: string } }[] };
}

async function page(path: string, cookie: string | null) {
  const res = await fetch(`${base}${path}`, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
  const location = res.headers.get("location") ?? "";
  return { status: res.status, location: location.replace(base, "") };
}

const expectPage = async (label: string, path: string, cookie: string | null, redirectTo?: string) => {
  const r = await page(path, cookie);
  if (redirectTo) check(`${label} ${path} → ${redirectTo}`, r.status >= 300 && r.status < 400 && r.location === redirectTo, `${r.status} ${r.location}`);
  else check(`${label} ${path} opens`, r.status === 200, String(r.status));
};

async function run() {
  console.log(`Smoke test against ${base}\n`);
  const health = await fetch(`${base}/api/health`);
  check("health check", health.ok, String(health.status));

  // Guest
  for (const path of ["/", "/marketplace", "/dashboard", "/admin", "/issues/create"]) await expectPage("guest", path, null);
  const guestAdmin = await gql(null, "{ adminUsers { id } }");
  check("guest cannot query adminUsers", !!guestAdmin.errors?.length);

  // Developer (default role for new accounts)
  const dev = await login(`0x${randomBytes(32).toString("hex")}`);
  check("new account is DEVELOPER", dev.role === "DEVELOPER", dev.role);
  await expectPage("developer", "/dashboard", dev.cookie);
  await expectPage("developer", "/admin", dev.cookie, "/dashboard");
  const devAdmin = await gql(dev.cookie, "{ adminUsers { id } }");
  check("developer cannot query adminUsers", !!devAdmin.errors?.length);

  // Client
  const client = await login(`0x${randomBytes(32).toString("hex")}`);
  const switched = await gql(client.cookie, `mutation { updateProfile(input: { role: "CLIENT" }) { role } }`);
  check("switch account to CLIENT", switched.data?.updateProfile?.role === "CLIENT", JSON.stringify(switched.errors ?? ""));
  await expectPage("client", "/issues/create", client.cookie);
  await expectPage("client", "/admin", client.cookie, "/dashboard");

  const tokens = await gql(null, "{ tokens { id symbol } }");
  const tokenId = tokens.data?.tokens?.[0]?.id;
  check("USDC token is seeded", !!tokenId, JSON.stringify(tokens.data?.tokens ?? tokens.errors));
  if (tokenId) {
    const input = {
      title: "Smoke test bounty — safe to delete",
      description: "Created by scripts/smoke-roles.ts to verify role permissions on this deployment.",
      category: "BUG_FIX",
      bountyAmount: 25,
      tokenId,
    };
    const mutation = "mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }";
    const created = await gql(client.cookie, mutation, { input });
    check("client can create issue", !!created.data?.createIssue?.id, JSON.stringify(created.errors ?? ""));
    const devCreate = await gql(dev.cookie, mutation, { input });
    check("developer cannot create issue", devCreate.errors?.[0]?.extensions?.code === "CLIENT_ROLE_REQUIRED");
    const issueId = created.data?.createIssue?.id;
    if (issueId) {
      const applied = await gql(dev.cookie, `mutation { applyToIssue(input: { issueId: "${issueId}", message: "smoke" }) { id } }`);
      check("developer can apply", !!applied.data?.applyToIssue?.id, JSON.stringify(applied.errors ?? ""));
      const selfApply = await gql(client.cookie, `mutation { applyToIssue(input: { issueId: "${issueId}" }) { id } }`);
      check("client cannot apply", !!selfApply.errors?.length);
    }
  }

  // Admin
  const adminKey = process.env.SMOKE_ADMIN_KEY;
  if (!adminKey) {
    console.log("SKIP  admin checks (set SMOKE_ADMIN_KEY)");
  } else {
    const admin = await login(adminKey);
    check("ADMIN_WALLETS wallet becomes ADMIN", admin.role === "ADMIN", admin.role);
    await expectPage("admin", "/admin", admin.cookie);
    await expectPage("admin", "/dashboard", admin.cookie, "/admin");
    await expectPage("admin", "/issues/create", admin.cookie, "/admin");
    const users = await gql(admin.cookie, "{ adminUsers { id } }");
    check("admin can query adminUsers", Array.isArray(users.data?.adminUsers), JSON.stringify(users.errors ?? ""));
  }

  console.log(`\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
