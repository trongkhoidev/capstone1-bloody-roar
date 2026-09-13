const SENSITIVE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "evm-private-key", pattern: /\b0x[a-fA-F0-9]{64}\b/g },
  { name: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "groq-key", pattern: /\bgsk_[A-Za-z0-9]{20,}\b/g },
  { name: "github-classic-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "github-fine-grained-token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "stripe-secret", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "npm-token", pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "private-key-block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{20,}?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "database-url", pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi },
  { name: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi },
  { name: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { name: "vietnamese-phone", pattern: /(?<!\d)(?:\+?84|0)(?:3|5|7|8|9)\d{8}(?!\d)/g },
  { name: "us-phone", pattern: /(?<!\d)(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-][2-9]\d{2}[ .-]\d{4}(?!\d)/g },
  { name: "credential-assignment", pattern: /\b(?:password|passwd|secret|api[_ -]?key)\s*[:=]\s*["']?[^\s"']{8,}/gi },
  { name: "aws-secret-assignment", pattern: /\baws_secret_access_key\s*[:=]\s*["']?[^\s"']{20,}/gi },
  { name: "private-key-env", pattern: /\b(?:PRIVATE_KEY|DEPLOYER_PRIVATE_KEY)\s*[:=]\s*0x[a-fA-F0-9]{64}\b/gi },
];

export interface GuardResult {
  content: string;
  wasModified: boolean;
  matches: string[];
}

export function scanAndMask(content: string): GuardResult {
  let maskedContent = content;
  const matches: string[] = [];

  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(maskedContent)) {
      matches.push(name);
      pattern.lastIndex = 0;
      maskedContent = maskedContent.replace(pattern, "[REDACTED]");
    }
  }

  return { content: maskedContent, wasModified: maskedContent !== content, matches };
}

export const AI_GUARD_RULE_COUNT = SENSITIVE_PATTERNS.length;
