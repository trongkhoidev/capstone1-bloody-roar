import { LoginPayloadData } from "@thirdweb-dev/auth";

// Thirdweb's exact implementation
function thirdwebCreateLoginMessage(payload: any): string {
  const typeField = "Ethereum";
  const header = `${payload.domain} wants you to sign in with your ${typeField} account:`;
  let prefix = [header, payload.address].join("\n");
  prefix = [prefix, payload.statement].join("\n\n");
  if (payload.statement) {
    prefix += "\n";
  }

  const suffixArray = [];
  if (payload.uri) {
    const uriField = `URI: ${payload.uri}`;
    suffixArray.push(uriField);
  }

  const versionField = `Version: ${payload.version}`;
  suffixArray.push(versionField);

  if (payload.chain_id) {
    const chainField = `Chain ID: ` + payload.chain_id || "1";
    suffixArray.push(chainField);
  }

  const nonceField = `Nonce: ${payload.nonce}`;
  suffixArray.push(nonceField);

  const issuedAtField = `Issued At: ${payload.issued_at}`;
  suffixArray.push(issuedAtField);

  const expiryField = `Expiration Time: ${payload.expiration_time}`;
  suffixArray.push(expiryField);

  if (payload.invalid_before) {
    const invalidBeforeField = `Not Before: ${payload.invalid_before}`;
    suffixArray.push(invalidBeforeField);
  }

  if (payload.resources) {
    suffixArray.push(
      [`Resources:`, ...payload.resources.map((x: string) => `- ${x}`)].join("\n"),
    );
  }

  const suffix = suffixArray.join("\n");
  return [prefix, suffix].join("\n");
}

// User's exact implementation
function userCreateLoginMessage(payload: any): string {
  const header = `${payload.domain} wants you to sign in with your Ethereum account:`;
  let prefix = `${header}\n${payload.address}\n\n${payload.statement ?? ""}`;
  if (payload.statement) prefix += "\n";

  const suffix: string[] = [];
  if (payload.uri) suffix.push(`URI: ${payload.uri}`);
  suffix.push(`Version: ${payload.version}`);
  if (payload.chain_id) suffix.push(`Chain ID: ${payload.chain_id}`);
  suffix.push(`Nonce: ${payload.nonce}`);
  suffix.push(`Issued At: ${payload.issued_at}`);
  suffix.push(`Expiration Time: ${payload.expiration_time}`);
  if (payload.invalid_before) suffix.push(`Not Before: ${payload.invalid_before}`);
  if (payload.resources?.length) suffix.push(["Resources:", ...payload.resources.map((resource: string) => `- ${resource}`)].join("\n"));
  return `${prefix}\n${suffix.join("\n")}`;
}

const payload = {
  type: "evm",
  domain: "localhost:4000",
  address: "0x8a41338669fd9410437bf36f44eb39767e4a0ae0",
  statement: "Please ensure that the domain above matches the URL of the current website.",
  uri: undefined,
  version: "1",
  chain_id: undefined,
  nonce: "1ae9f973-2057-41e3-893b-93b24efba21c",
  issued_at: "2026-09-13T09:48:57.800Z",
  expiration_time: "2026-09-13T09:58:57.865Z",
  invalid_before: "2026-09-13T09:38:57.866Z",
  resources: undefined,
};

const t1 = thirdwebCreateLoginMessage(payload);
const t2 = userCreateLoginMessage(payload);

console.log("ARE THEY EXACTLY EQUAL?");
console.log(t1 === t2);
if (t1 !== t2) {
  console.log("t1 length:", t1.length);
  console.log("t2 length:", t2.length);
  for (let i = 0; i < t1.length; i++) {
    if (t1[i] !== t2[i]) {
      console.log(`Difference at ${i}: t1='${t1[i]}' t2='${t2[i]}'`);
      break;
    }
  }
}
