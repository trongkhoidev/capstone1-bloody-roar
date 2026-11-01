import * as fs from "node:fs";
import * as path from "node:path";

export interface LedgerEntry {
  ts: string;
  from: string;
  to: string;
  asset: "ETH" | "USDC";
  amount: string;
  txHash: string;
  purpose: string;
}

export const LEDGER_PATH = path.resolve(process.cwd(), "demo-wallets/ledger.jsonl");

export function appendLedger(entry: LedgerEntry, ledgerPath: string = LEDGER_PATH): void {
  const dir = path.dirname(ledgerPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(ledgerPath, line, "utf-8");
}

export function readLedger(ledgerPath: string = LEDGER_PATH): LedgerEntry[] {
  if (!fs.existsSync(ledgerPath)) return [];
  const lines = fs.readFileSync(ledgerPath, "utf-8").split("\n").filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l) as LedgerEntry);
}
