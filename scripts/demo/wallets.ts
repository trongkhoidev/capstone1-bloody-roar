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
export const KEYS_HARDHAT_PATH = path.join(WALLETS_DIR, "keys-hardhat.json");
export const DOC_PATH = path.resolve(process.cwd(), "docs/demo/WALLETS.md");
export const DOC_HARDHAT_PATH = path.resolve(process.cwd(), "docs/demo/WALLETS-HARDHAT.md");
export const HARDHAT_ADMIN_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
// Hardhat #2 from the public test mnemonic: arbiter on-chain and in ADMIN_WALLETS.
export const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";

export const HARDHAT_ROLE_DEFINITIONS: WalletDef[] = [
  { role: "deployer", persona: "system", description: "Deployer for Escrow and MockUSDC (Hardhat #0)" },
  { role: "owner", persona: "ownerSafe", description: "On-chain contract owner (Hardhat #1)" },
  { role: "admin", persona: "admin", description: "Admin for platform operations and dispute rulings (Hardhat #2, arbiter Safe)" },
  { role: "feeRecipient", persona: "feeSafe", description: "Platform fee recipient (Hardhat #3)" },
  // #4–#19: 16 user chính hh04…hh19 (có sẵn 10.000 ETH)
  ...Array.from({ length: 8 }, (_, i) => {
    const id = String(i + 4).padStart(2, "0");
    return { role: `hh${id}`, persona: "client" as const, description: `Hardhat primary user ${id} (client persona, index #${i + 4})` };
  }),
  ...Array.from({ length: 8 }, (_, i) => {
    const id = String(i + 12).padStart(2, "0");
    return { role: `hh${id}`, persona: "developer" as const, description: `Hardhat primary user ${id} (developer persona, index #${i + 12})` };
  }),
  // #20–#49: 30 user phụ hh20…hh49 (cùng mnemonic, nạp 100 ETH)
  ...Array.from({ length: 15 }, (_, i) => {
    const id = String(i + 20).padStart(2, "0");
    return { role: `hh${id}`, persona: "client" as const, description: `Hardhat secondary user ${id} (client persona, index #${i + 20})` };
  }),
  ...Array.from({ length: 14 }, (_, i) => {
    const id = String(i + 35).padStart(2, "0");
    return { role: `hh${id}`, persona: "developer" as const, description: `Hardhat secondary user ${id} (developer persona, index #${i + 35})` };
  }),
  { role: "hh49", persona: "spammer", description: "Hardhat spam simulator user 49 (spammer persona, index #49)" },
];

export function isHardhatMode(): boolean {
  return process.env.DEMO_ACCOUNTS === "hardhat";
}

export function getDefaultKeysPath(): string {
  return isHardhatMode() ? KEYS_HARDHAT_PATH : KEYS_PATH;
}

export function getDefaultDocPath(): string {
  return isHardhatMode() ? DOC_HARDHAT_PATH : DOC_PATH;
}

export function loadOrCreateWallets(
  keysPath: string = getDefaultKeysPath(),
  docPath: string = getDefaultDocPath()
): WalletStore {
  const isHardhat = isHardhatMode() || keysPath.includes("hardhat");
  const roleDefs = isHardhat ? HARDHAT_ROLE_DEFINITIONS : ROLE_DEFINITIONS;

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
  for (let idx = 0; idx < roleDefs.length; idx++) {
    const def = roleDefs[idx]!;
    if (isHardhat) {
      const wallet = ethers.Wallet.fromMnemonic(HARDHAT_MNEMONIC, `m/44'/60'/0'/0/${idx}`);
      updated[def.role] = {
        role: def.role,
        address: wallet.address,
        privateKey: wallet.privateKey,
        persona: def.persona,
      };
      continue;
    }

    if (process.env.CHAIN_ID === "31337" && def.role === "admin") {
      updated[def.role] = {
        role: def.role,
        address: HARDHAT_ADMIN_ADDRESS,
        privateKey: ethers.Wallet.fromMnemonic(HARDHAT_MNEMONIC, "m/44'/60'/0'/0/2").privateKey,
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

  if (isHardhat && updated["hh49"]) {
    updated["spammer"] = {
      role: "spammer",
      address: updated["hh49"].address,
      privateKey: updated["hh49"].privateKey,
      persona: "spammer",
    };
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

  const title = isHardhat ? "# Demo Wallets from Hardhat Accounts" : "# Demo Wallets on Base Sepolia";
  const lines = [
    title,
    "",
    "Danh sách các ví cho kịch bản chạy demo và tạo dữ liệu thật. File này chỉ chứa vai trò, địa chỉ và persona (không chứa private key).",
    "",
    "| Vai trò | Địa chỉ | Persona | Mô tả |",
    "| --- | --- | --- | --- |",
  ];

  for (const def of roleDefs) {
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
  const keysPath = getDefaultKeysPath();
  const store = loadOrCreateWallets(keysPath);
  console.log(`Demo wallets loaded/created: ${Object.keys(store).length} wallets in ${keysPath}`);
}
