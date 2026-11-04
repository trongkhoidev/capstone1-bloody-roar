import * as fs from "node:fs";
import * as path from "node:path";
import { ethers } from "./lib/ethers";

export interface WalletDef {
  role: string;
  persona: "system" | "admin" | "ownerSafe" | "arbiterSafe" | "feeSafe" | "client" | "developer" | "both" | "spammer";
  description: string;
}

export interface WalletEntry {
  role: string;
  address: string;
  privateKey: string;
  persona: WalletDef["persona"];
}

export type WalletStore = Record<string, WalletEntry>;

export const ROLE_DEFINITIONS: WalletDef[] = [
  { role: "deployer", persona: "system", description: "Deployer for Escrow and role Safes" },
  { role: "treasury", persona: "system", description: "Receives faucet ETH and USDC, distributes to agents" },
  { role: "admin", persona: "admin", description: "Admin for platform operations and dispute rulings" },
  { role: "ownerSafe1", persona: "ownerSafe", description: "Signer 1 of 3 for Owner Safe" },
  { role: "ownerSafe2", persona: "ownerSafe", description: "Signer 2 of 3 for Owner Safe" },
  { role: "ownerSafe3", persona: "ownerSafe", description: "Signer 3 of 3 for Owner Safe" },
  { role: "arbiterSafe1", persona: "arbiterSafe", description: "Signer 1 of 3 for Arbiter Safe" },
  { role: "arbiterSafe2", persona: "arbiterSafe", description: "Signer 2 of 3 for Arbiter Safe" },
  { role: "arbiterSafe3", persona: "arbiterSafe", description: "Signer 3 of 3 for Arbiter Safe" },
  { role: "feeSafe1", persona: "feeSafe", description: "Signer 1 of 3 for Fee Safe" },
  { role: "feeSafe2", persona: "feeSafe", description: "Signer 2 of 3 for Fee Safe" },
  { role: "feeSafe3", persona: "feeSafe", description: "Signer 3 of 3 for Fee Safe" },
  // 40 user wallets: 10 client, 22 developer, 8 both
  ...Array.from({ length: 10 }, (_, i) => {
    const id = String(i + 1).padStart(2, "0");
    return { role: `user${id}`, persona: "client" as const, description: `Client persona ${id}` };
  }),
  ...Array.from({ length: 22 }, (_, i) => {
    const id = String(i + 11).padStart(2, "0");
    return { role: `user${id}`, persona: "developer" as const, description: `Developer persona ${id}` };
  }),
  ...Array.from({ length: 8 }, (_, i) => {
    const id = String(i + 33).padStart(2, "0");
    return { role: `user${id}`, persona: "both" as const, description: `Dual client/developer persona ${id}` };
  }),
  { role: "spammer", persona: "spammer", description: "Spam behavior simulator for admin moderation" },
];

export const WALLETS_DIR = path.resolve(process.cwd(), "demo-wallets");
export const KEYS_PATH = path.join(WALLETS_DIR, "keys.json");
export const DOC_PATH = path.resolve(process.cwd(), "docs/demo/WALLETS.md");
export const HARDHAT_ADMIN_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
export const HARDHAT_ADMIN_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

export function loadOrCreateWallets(
  keysPath: string = KEYS_PATH,
  docPath: string = DOC_PATH
): WalletStore {
  const existing: WalletStore = {};
  if (fs.existsSync(keysPath)) {
    try {
      const raw = fs.readFileSync(keysPath, "utf-8");
      const parsed = JSON.parse(raw) as WalletStore;
      Object.assign(existing, parsed);
    } catch {
      // If parsing fails, regenerate
    }
  }

  const updated: WalletStore = {};
  for (const def of ROLE_DEFINITIONS) {
    if (process.env.CHAIN_ID === "31337" && def.role === "admin") {
      updated[def.role] = {
        role: def.role,
        address: HARDHAT_ADMIN_ADDRESS,
        privateKey: HARDHAT_ADMIN_KEY,
        persona: def.persona,
      };
      continue;
    }
    const prev = existing[def.role];
    if (prev && prev.address && prev.privateKey) {
      updated[def.role] = {
        role: def.role,
        address: prev.address,
        privateKey: prev.privateKey,
        persona: def.persona,
      };
    } else {
      const wallet = ethers.Wallet.createRandom();
      updated[def.role] = {
        role: def.role,
        address: wallet.address,
        privateKey: wallet.privateKey,
        persona: def.persona,
      };
    }
  }

  const dir = path.dirname(keysPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(keysPath, JSON.stringify(updated, null, 2), { mode: 0o600 });
  fs.chmodSync(keysPath, 0o600);

  // Generate WALLETS.md (no private keys)
  const docDir = path.dirname(docPath);
  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
  }

  const lines = [
    "# Demo Wallets on Base Sepolia",
    "",
    "Danh sách các ví cho kịch bản chạy demo và tạo dữ liệu thật. File này chỉ chứa vai trò, địa chỉ và persona (không chứa private key).",
    "",
    "| Vai trò | Địa chỉ | Persona | Mô tả |",
    "| --- | --- | --- | --- |",
  ];

  for (const def of ROLE_DEFINITIONS) {
    const w = updated[def.role];
    if (w) {
      lines.push(`| \`${w.role}\` | \`${w.address}\` | \`${w.persona}\` | ${def.description} |`);
    }
  }
  lines.push("");

  fs.writeFileSync(docPath, lines.join("\n"), "utf-8");

  return updated;
}

if ((import.meta as unknown as { main?: boolean }).main) {
  const store = loadOrCreateWallets();
  console.log(`Demo wallets loaded/created: ${Object.keys(store).length} wallets in ${KEYS_PATH}`);
}
