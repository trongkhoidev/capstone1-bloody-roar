import { describe, expect, it } from "vitest";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { AI_GUARD_RULE_COUNT, scanAndMask } from "../../ai/guard/scanner";

// Fake secrets are built from parts at run time, so secret scanners do not flag this fixture file.
const fake = (...parts: string[]) => parts.join("");

// Deterministic guard cases (AI-16). masked: true means the input must be redacted, false means it must pass unchanged.
const hex = (byte: string, bytes = 32) => `0x${byte.repeat(bytes)}`;
const brokenPhrase = "abandon ".repeat(11) + "abandon";
const validPhrase12 = generateMnemonic(wordlist, 128);
const validPhrase24 = generateMnemonic(wordlist, 256);

const cases: Array<{ name: string; input: string; masked: boolean }> = [
  // Secrets and personal data that must be masked
  { name: "email address", input: "email: dev@example.com", masked: true },
  { name: "email with plus tag", input: "contact jane.doe+work@mail.co.uk please", masked: true },
  { name: "email in a sentence", input: "reach ops@acme.io today", masked: true },
  { name: "Vietnamese mobile", input: "gọi 0912345678 nhé", masked: true },
  { name: "Vietnamese mobile with +84", input: "call +84912345678", masked: true },
  { name: "Vietnamese mobile starting 03", input: "số 0387654321", masked: true },
  { name: "US phone with parentheses", input: "office (415) 555-2671", masked: true },
  { name: "US phone with dots", input: "415.555.2671 after five", masked: true },
  { name: "OpenAI project key", input: fake("sk-", "proj-abcdefghijklmnopqrstu123"), masked: true },
  { name: "OpenAI legacy key", input: fake("key sk-", "abcdefghijklmnopqrstuvwxyz0123"), masked: true },
  { name: "Groq key", input: fake("gsk_", "abcdefghijklmnopqrstuv1234"), masked: true },
  { name: "GitHub classic token", input: fake("ghp_", "abcdefghijklmnopqrstuvwxyz1234"), masked: true },
  { name: "GitHub fine-grained token", input: fake("github_pat_", "11ABCDEFGHIJKLMNOPQRS_tuvwxyz"), masked: true },
  { name: "Google API key", input: fake("AIzaSyD-", "abcdefghijklmnopqrstuvwxyz12"), masked: true },
  { name: "AWS access key", input: fake("AKIA", "IOSFODNN7EXAMPLE"), masked: true },
  { name: "Stripe live key", input: fake("sk_", "live_", "abcdefghijklmnop1234"), masked: true },
  { name: "Slack token", input: fake("xoxb-", "1234567890-abcdef"), masked: true },
  { name: "npm token", input: fake("npm_", "abcdefghijklmnopqrstuvwxyz1234567890"), masked: true },
  { name: "JWT", input: fake("eyJhbGciOiJIUzI1NiJ9.", "eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop"), masked: true },
  { name: "PEM private key block", input: fake("-----BEGIN ", "PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END ", "PRIVATE KEY-----"), masked: true },
  { name: "Postgres URL with password", input: fake("postgres://user:", "s3cret@db.internal:5432/app"), masked: true },
  { name: "MySQL URL with password", input: fake("mysql://root:", "pw123@host/db"), masked: true },
  { name: "bearer token", input: fake("Authorization: Bearer ", "abcdefghijklmnopqrstuvwxyz0123"), masked: true },
  { name: "password assignment", input: fake("password=", "hunter22secret"), masked: true },
  { name: "API key assignment", input: fake("API_KEY: ", "abcdef123456"), masked: true },
  { name: "secret assignment", input: fake("secret = ", "s3cr3tvalue"), masked: true },
  { name: "AWS secret assignment", input: fake("aws_secret_access_key = ", "wJalrXUtnFEMI/K7MDENG/", "bPxRfiCYEXAMPLEKEY"), masked: true },
  { name: "bare 32-byte private key", input: `my key is ${hex("ab")}`, masked: true },
  { name: "PRIVATE_KEY env line", input: `PRIVATE_KEY=${hex("cd")}`, masked: true },
  { name: "DEPLOYER_PRIVATE_KEY env line", input: `DEPLOYER_PRIVATE_KEY: ${hex("ef")}`, masked: true },
  { name: "12-word recovery phrase", input: `seed: ${validPhrase12}`, masked: true },
  { name: "24-word recovery phrase", input: `backup words ${validPhrase24} keep safe`, masked: true },
  { name: "recovery phrase in capitals", input: `Recovery: ${validPhrase12.toUpperCase()}`, masked: true },

  // Ordinary text and identifiers that must pass unchanged
  { name: "transaction hash after tx label", input: `Settled in tx ${hex("a1")}`, masked: false },
  { name: "transaction hash with colon", input: `Tx hash: ${hex("a1")}`, masked: false },
  { name: "transaction hash after the word transaction", input: `transaction ${hex("a2")} confirmed`, masked: false },
  { name: "termsHash JSON value", input: `{"termsHash": "${hex("b1")}"}`, masked: false },
  { name: "decisionHash assignment", input: `decisionHash=${hex("b2")}`, masked: false },
  { name: "deliveryHash field", input: `deliveryHash: ${hex("b3")}`, masked: false },
  { name: "git commit SHA", input: "fixed in 3f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39", masked: false },
  { name: "sha256 digest without prefix", input: "sha256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", masked: false },
  { name: "Ethereum address", input: "send to 0x52908400098527886E0F7030069857D2E4169EE7 today", masked: false },
  { name: "plain sentence", input: "I will send the pull request for review this afternoon.", masked: false },
  { name: "meeting time", input: "Let's meet at 10:30 on Monday.", masked: false },
  { name: "code snippet", input: "const total = items.length * 2;", masked: false },
  { name: "GitHub URL without credentials", input: "https://github.com/acme/checkout/pull/42", masked: false },
  { name: "version number", input: "upgrade to v2.4.0 next sprint", masked: false },
  { name: "order number", input: "order 123456789012 shipped", masked: false },
  { name: "ISO date", input: "deadline 2026-10-27", masked: false },
  { name: "price with decimals", input: "Price: 1250.00 USDT", masked: false },
  { name: "markdown list", input: "- item one\n- item two", masked: false },
  { name: "invalid recovery phrase checksum", input: `typo: ${brokenPhrase}`, masked: false },
  { name: "password policy sentence", input: "The password policy requires eight characters.", masked: false },
  { name: "email subject label", input: "email subject: weekly update", masked: false },
  { name: "bearer word in prose", input: "Bearer token will expire soon", masked: false },
  { name: "API key rotation note", input: "api key rotation schedule is monthly", masked: false },
  { name: "secret with short value", input: "my secret: n/a", masked: false },
  { name: "greeting", input: "thanks!! see you tomorrow", masked: false },
];

describe("AI Guard deterministic eval (AI-16)", () => {
  it("covers at least 50 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
  });

  it.each(cases)("$name", ({ input, masked }) => {
    const result = scanAndMask(input);

    expect(result.wasModified).toBe(masked);
    if (masked) expect(result.content).toContain("[REDACTED]");
    else expect(result.content).toBe(input);
  });

  it("generated phrases used in the eval are valid BIP-39 mnemonics", () => {
    expect(validateMnemonic(validPhrase12, wordlist)).toBe(true);
    expect(validateMnemonic(validPhrase24, wordlist)).toBe(true);
    expect(AI_GUARD_RULE_COUNT).toBeGreaterThan(20);
  });
});
