// packages/shared/src/escrow/hashing.ts
// Hash tài liệu theo QĐ-15: keccak256(utf8(JCS(json))), JCS là RFC 8785. Mỗi hàm chỉ hash đúng các field liệt kê,
// để field lạ từ người gọi không làm đổi hash âm thầm.
import canonicalize from "canonicalize";
import { keccak256, toBytes } from "viem";
import type { Hex } from "./types";

export function canonicalJson(value: unknown): string {
  const text = canonicalize(value);
  if (text === undefined) throw new Error("value has no JSON form");
  return text;
}

export function keccakUtf8(text: string): Hex {
  return keccak256(toBytes(text));
}

// QĐ-20. amountRaw và deliveryDeadline là chuỗi số thập phân để không mất độ chính xác khi JCS.
export type TermsInput = {
  issueId: string;
  termsVersion: number;
  title: string;
  descriptionSha256: string;
  category: string;
  acceptanceCriteria: { id: string; text: string; approved: boolean }[];
  token: Hex;
  amountRaw: string;
  deliveryDeadline: string; // unix seconds
  githubRepo: string;
};

// BE-39, QĐ-22
export type DeliveryManifest = {
  issueId: string;
  submissionId: string;
  descriptionSha256: string;
  prUrl: string;
  commitSha: string;
  attachments: { key: string; sha256: string; mime: string; size: number }[];
};

// QĐ-26
export type EvidenceManifest = {
  escrowId: string;
  side: "CLIENT" | "DEVELOPER";
  statement: { text: string; sha256: string };
  files: { key: string; sha256: string; mime: string; size: number; name: string }[];
  chatRange: { fromMessageId: string; toMessageId: string; transcriptSha256: string } | null;
};

// QĐ-25, BE-54. Đề xuất: docs chỉ ghi draftRuling(issueId, clientBps, rationale).
export type DecisionDocument = {
  issueId: string;
  escrowId: string;
  clientBps: number;
  rationale: string;
};

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function computeTermsHash(input: TermsInput): Hex {
  // Chuỗi không phải số nguyên thập phân thì hash sẽ khác với bản on-chain, nên từ chối ngay.
  if (!/^\d+$/.test(input.amountRaw) || !/^\d+$/.test(input.deliveryDeadline)) {
    throw new Error("amountRaw and deliveryDeadline must be decimal integers");
  }
  const acceptanceCriteria = input.acceptanceCriteria
    .filter((criterion) => criterion.approved)
    .map(({ id, text }) => ({ id, text }))
    .sort(byId);
  return keccakUtf8(
    canonicalJson({
      issueId: input.issueId,
      termsVersion: input.termsVersion,
      title: input.title,
      descriptionSha256: input.descriptionSha256,
      category: input.category,
      acceptanceCriteria,
      token: input.token,
      amountRaw: input.amountRaw,
      deliveryDeadline: input.deliveryDeadline,
      githubRepo: input.githubRepo,
    }),
  );
}

export function computeDeliveryHash(manifest: DeliveryManifest): Hex {
  return keccakUtf8(
    canonicalJson({
      issueId: manifest.issueId,
      submissionId: manifest.submissionId,
      descriptionSha256: manifest.descriptionSha256,
      prUrl: manifest.prUrl,
      commitSha: manifest.commitSha,
      attachments: manifest.attachments.map(({ key, sha256, mime, size }) => ({ key, sha256, mime, size })),
    }),
  );
}

export function computeEvidenceManifestHash(manifest: EvidenceManifest): Hex {
  return keccakUtf8(
    canonicalJson({
      escrowId: manifest.escrowId,
      side: manifest.side,
      statement: { text: manifest.statement.text, sha256: manifest.statement.sha256 },
      files: manifest.files.map(({ key, sha256, mime, size, name }) => ({ key, sha256, mime, size, name })),
      chatRange: manifest.chatRange && {
        fromMessageId: manifest.chatRange.fromMessageId,
        toMessageId: manifest.chatRange.toMessageId,
        transcriptSha256: manifest.chatRange.transcriptSha256,
      },
    }),
  );
}

export function computeDecisionHash(doc: DecisionDocument): Hex {
  return keccakUtf8(
    canonicalJson({
      issueId: doc.issueId,
      escrowId: doc.escrowId,
      clientBps: doc.clientBps,
      rationale: doc.rationale,
    }),
  );
}
