// bun run replay --from <block>
import { prisma } from "@bloody-roar/database";
import { loadConfig } from "../config";
import { requestReplay } from "./replay";

const flag = process.argv.indexOf("--from");
const raw = flag === -1 ? undefined : process.argv[flag + 1];
if (!raw || !/^\d+$/.test(raw)) {
  console.error("usage: bun run replay --from <block>");
  process.exit(1);
}

try {
  await requestReplay(prisma, loadConfig(), BigInt(raw));
  console.log(`replay requested from block ${raw}; the worker picks it up on its next tick`);
} finally {
  await prisma.$disconnect();
}
