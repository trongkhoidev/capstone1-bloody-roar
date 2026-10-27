// apps/web/src/test/escrow-core/hashing.test.ts
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeDecisionHash,
  computeDeliveryHash,
  computeEvidenceManifestHash,
  computeTermsHash,
  keccakUtf8,
  type DeliveryManifest,
  type TermsInput,
} from "@bloody-roar/shared/escrow";

// Test vector cố định. HashVectors.t.sol tính keccak256 trên cùng chuỗi JSON và phải ra cùng hash.
const ZERO32 = "00".repeat(32);

const terms: TermsInput = {
  issueId: "issue-1",
  termsVersion: 1,
  title: "Fix login",
  descriptionSha256: ZERO32,
  category: "BUG_FIX",
  acceptanceCriteria: [
    { id: "c2", text: "B", approved: true },
    { id: "c1", text: "A", approved: true },
    { id: "c3", text: "C", approved: false },
  ],
  token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amountRaw: "1250000000",
  deliveryDeadline: "1791828000",
  githubRepo: "bloody-roar/capstone1",
};
const TERMS_JSON =
  '{"acceptanceCriteria":[{"id":"c1","text":"A"},{"id":"c2","text":"B"}],"amountRaw":"1250000000","category":"BUG_FIX","deliveryDeadline":"1791828000","descriptionSha256":"0000000000000000000000000000000000000000000000000000000000000000","githubRepo":"bloody-roar/capstone1","issueId":"issue-1","termsVersion":1,"title":"Fix login","token":"0x036CbD53842c5426634e7929541eC2318f3dCF7e"}';
const TERMS_HASH = "0x63710365bb46fd288f7df1eb11c385952b61aca9372367c618bcd66e892af6c3";

const delivery: DeliveryManifest = {
  issueId: "issue-1",
  submissionId: "sub-1",
  descriptionSha256: ZERO32,
  prUrl: "https://github.com/bloody-roar/capstone1/pull/7",
  commitSha: "abcdef1",
  attachments: [{ key: "delivery/a.png", sha256: "11".repeat(32), mime: "image/png", size: 2048 }],
};
const DELIVERY_JSON =
  '{"attachments":[{"key":"delivery/a.png","mime":"image/png","sha256":"1111111111111111111111111111111111111111111111111111111111111111","size":2048}],"commitSha":"abcdef1","descriptionSha256":"0000000000000000000000000000000000000000000000000000000000000000","issueId":"issue-1","prUrl":"https://github.com/bloody-roar/capstone1/pull/7","submissionId":"sub-1"}';
const DELIVERY_HASH = "0x1a7bd1d14d6b65e4078ee767b77590e7821a634a4896bc3b1add426d0f337b8f";

const evidence = {
  escrowId: "issue-1",
  side: "CLIENT" as const,
  statement: { text: "Late delivery", sha256: "22".repeat(32) },
  files: [{ key: "evidence/x.pdf", sha256: "33".repeat(32), mime: "application/pdf", size: 1000, name: "x.pdf" }],
  chatRange: { fromMessageId: "m1", toMessageId: "m9", transcriptSha256: "44".repeat(32) },
};
const EVIDENCE_JSON =
  '{"chatRange":{"fromMessageId":"m1","toMessageId":"m9","transcriptSha256":"4444444444444444444444444444444444444444444444444444444444444444"},"escrowId":"issue-1","files":[{"key":"evidence/x.pdf","mime":"application/pdf","name":"x.pdf","sha256":"3333333333333333333333333333333333333333333333333333333333333333","size":1000}],"side":"CLIENT","statement":{"sha256":"2222222222222222222222222222222222222222222222222222222222222222","text":"Late delivery"}}';
const EVIDENCE_HASH = "0x0f8546fe6034e16b1b75c4460f305b0d20cabeaf896a5510205d8c32ca101f60";
const EVIDENCE_NULL_CHAT_JSON =
  '{"chatRange":null,"escrowId":"issue-1","files":[{"key":"evidence/x.pdf","mime":"application/pdf","name":"x.pdf","sha256":"3333333333333333333333333333333333333333333333333333333333333333","size":1000}],"side":"CLIENT","statement":{"sha256":"2222222222222222222222222222222222222222222222222222222222222222","text":"Late delivery"}}';
const EVIDENCE_NULL_CHAT_HASH = "0xf0077ee4bc29301de477bec4660a1508755dbe01d10b5e60e334c90d98d9002f";

const decision = { issueId: "issue-1", escrowId: "issue-1", clientBps: 5000, rationale: "Split evenly" };
const DECISION_JSON = '{"clientBps":5000,"escrowId":"issue-1","issueId":"issue-1","rationale":"Split evenly"}';
const DECISION_HASH = "0x175f418b072513d49316abdd3c7032d9941b8934ac69f8b1fdf19a650419c041";

describe("canonicalJson and keccakUtf8", () => {
  it("sorts object keys and drops whitespace (RFC 8785)", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"b":1}');
  });

  it("refuses values with no JSON form or no exact JSON number", () => {
    expect(() => canonicalJson(undefined)).toThrow(/no JSON form/);
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("matches the standard Keccak-256 vectors (not SHA3-256)", () => {
    expect(keccakUtf8("")).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(keccakUtf8("abc")).toBe("0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  });
});

describe("computeTermsHash", () => {
  it("hashes the QĐ-20 fields in canonical form with approved criteria sorted by id", () => {
    expect(canonicalJson(JSON.parse(TERMS_JSON))).toBe(TERMS_JSON);
    expect(keccakUtf8(TERMS_JSON)).toBe(TERMS_HASH);
    expect(computeTermsHash(terms)).toBe(TERMS_HASH);
  });

  it("ignores unapproved criteria and the order criteria arrive in", () => {
    const reordered = { ...terms, acceptanceCriteria: [...terms.acceptanceCriteria].reverse() };
    expect(computeTermsHash(reordered)).toBe(TERMS_HASH);
  });

  it("changes when an amount, deadline or approved criterion changes", () => {
    expect(computeTermsHash({ ...terms, amountRaw: "1250000001" })).not.toBe(TERMS_HASH);
    expect(computeTermsHash({ ...terms, deliveryDeadline: "1791828001" })).not.toBe(TERMS_HASH);
    const edited = terms.acceptanceCriteria.map((c) => (c.id === "c1" ? { ...c, text: "A2" } : c));
    expect(computeTermsHash({ ...terms, acceptanceCriteria: edited })).not.toBe(TERMS_HASH);
  });

  it("rejects amounts and deadlines that are not plain decimal integers", () => {
    for (const amountRaw of ["1.5", "-1", "", "1e6", " 1"]) {
      expect(() => computeTermsHash({ ...terms, amountRaw }), amountRaw).toThrow(/decimal integers/);
    }
    expect(() => computeTermsHash({ ...terms, deliveryDeadline: "-1" })).toThrow(/decimal integers/);
  });
});

describe("computeDeliveryHash", () => {
  it("matches the frozen vector", () => {
    expect(keccakUtf8(DELIVERY_JSON)).toBe(DELIVERY_HASH);
    expect(computeDeliveryHash(delivery)).toBe(DELIVERY_HASH);
  });

  it("ignores fields outside the manifest", () => {
    const withExtra = { ...delivery, internalNote: "not part of the manifest" } as DeliveryManifest;
    expect(computeDeliveryHash(withExtra)).toBe(DELIVERY_HASH);
  });
});

describe("computeEvidenceManifestHash", () => {
  it("matches the frozen vector with a chat range", () => {
    expect(keccakUtf8(EVIDENCE_JSON)).toBe(EVIDENCE_HASH);
    expect(computeEvidenceManifestHash(evidence)).toBe(EVIDENCE_HASH);
  });

  it("hashes a missing chat range as null, not as an empty object", () => {
    expect(keccakUtf8(EVIDENCE_NULL_CHAT_JSON)).toBe(EVIDENCE_NULL_CHAT_HASH);
    expect(computeEvidenceManifestHash({ ...evidence, chatRange: null })).toBe(EVIDENCE_NULL_CHAT_HASH);
  });
});

describe("computeDecisionHash", () => {
  it("matches the frozen vector", () => {
    expect(keccakUtf8(DECISION_JSON)).toBe(DECISION_HASH);
    expect(computeDecisionHash(decision)).toBe(DECISION_HASH);
  });
});
