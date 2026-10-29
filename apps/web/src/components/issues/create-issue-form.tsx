"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { ISSUE_CATEGORIES, ISSUE_DIFFICULTY, BOUNTY_MIN_AMOUNT, BOUNTY_MAX_AMOUNT } from "@bloody-roar/shared";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { useUiPreferences } from "@/lib/ui-preferences";

const TOKENS_QUERY = `query ActiveTokens { tokens { id symbol name decimals chainId } }`;
const CREATE_ISSUE = `mutation CreateIssue($input: CreateIssueInput!) {
  createIssue(input: $input) { id title status }
}`;

type Token = { id: string; symbol: string; name: string; decimals: number; chainId: number };
type TokenResponse = { tokens: Token[] };
type CreateResponse = { createIssue: { id: string; title: string; status: string } };

const CATEGORY_NAMES: Record<(typeof ISSUE_CATEGORIES)[number], string> = {
  BUG_FIX: "Bug fix",
  FEATURE: "Feature",
  SMART_CONTRACT: "Smart contract",
  AUDIT: "Security audit",
  UI_UX: "UI / UX",
  DATA_SCIENCE: "Data science",
  DEVOPS: "DevOps",
  DOCUMENTATION: "Documentation",
  OTHER: "Other",
};

export function CreateIssueForm() {
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const { language, t, theme } = useUiPreferences();

  const categoryNames =
    language === "vi"
      ? {
          BUG_FIX: "Sửa lỗi",
          FEATURE: "Tính năng",
          SMART_CONTRACT: "Smart contract",
          AUDIT: "Kiểm toán bảo mật",
          UI_UX: "Giao diện",
          DATA_SCIENCE: "Khoa học dữ liệu",
          DEVOPS: "DevOps",
          DOCUMENTATION: "Tài liệu",
          OTHER: "Khác",
        }
      : CATEGORY_NAMES;

  const [tokens, setTokens] = useState<Token[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof ISSUE_CATEGORIES)[number]>("BUG_FIX");
  const [amount, setAmount] = useState(100);
  const [tokenId, setTokenId] = useState("");
  const [skillDraft, setSkillDraft] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<(typeof ISSUE_DIFFICULTY)[number] | "">("Hard");
  const [timeEstimate, setTimeEstimate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void graphqlRequest<TokenResponse>(TOKENS_QUERY)
      .then((result) => {
        if (!active) return;
        setTokens(result.tokens);
        setTokenId(result.tokens[0]?.id ?? "");
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load bounty tokens.");
      })
      .finally(() => {
        if (active) setLoadingTokens(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const addSkills = (value = skillDraft) => {
    const next = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    setSkills((current) => [...new Set([...current, ...next])].slice(0, 10));
    setSkillDraft("");
  };

  const removeSkill = (skillToRemove: string) => {
    setSkills((current) => current.filter((val) => val !== skillToRemove));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const input = {
        title: title.trim(),
        description: description.trim(),
        category,
        bountyAmount: Number(amount),
        tokenId,
        requiredSkills: skills,
        ...(difficulty ? { difficulty } : {}),
        ...(timeEstimate.trim() ? { timeEstimate: timeEstimate.trim() } : {}),
        ...(deadline ? { expiresAt: new Date(`${deadline}T23:59:59`).toISOString() } : {}),
        ...(githubRepo.trim() ? { githubRepo: githubRepo.trim() } : {}),
      };
      const result = await graphqlRequest<CreateResponse>(CREATE_ISSUE, { input });
      window.location.assign(`/issues/${result.createIssue.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tạo bài toán.");
    } finally {
      setSaving(false);
    }
  };

  if (authStatus === "restoring") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-7 w-32 animate-pulse rounded bg-[var(--sunk)]" />
        <div className="mt-5 h-[36rem] animate-pulse rounded-xl bg-[var(--surface)]" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 text-sm text-[var(--ink-2)] hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-4 w-4" /> {t("marketplace")}
        </Link>
        <div className="mt-5 form">
          <p className="lab" style={{ color: "var(--brand)" }}>
            {t("createBounty")}
          </p>
          <h1 className="h1" style={{ fontSize: 28, marginTop: 4 }}>
            {t("describeWork")}
          </h1>
          <div className="mt-6">
            <AuthRequiredPanel
              title={t("connectBeforePosting")}
              description={t("walletSessionPurpose")}
              actionLabel={t("connectWallet")}
            />
          </div>
        </div>
      </main>
    );
  }

  if (user.role !== "CLIENT") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 text-sm text-[var(--ink-2)] hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-4 w-4" /> {t("marketplace")}
        </Link>
        <section className="mt-5 form">
          <p className="lab">{t("clientWorkspace")}</p>
          <h1 className="h1" style={{ fontSize: 24, marginTop: 4 }}>
            {t("switchToClient")}
          </h1>
          <p className="sub">{t("developerRoleExplanation")}</p>
          <Button asChild className="mt-5" style={{ alignSelf: "flex-start" }}>
            <Link href="/profile">{t("openProfileSettings")}</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <div className={`br min-h-screen py-6 ${theme === "dark" ? "dark" : ""}`}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontSize: "12.5px", color: "var(--ink-3)" }}>
        <Link href="/dashboard" style={{ color: "var(--ink-2)" }}>
          My bounties
        </Link>{" "}
        / New bounty · draft
      </div>

      <div className="ph">
        <div>
          <h1 className="h1">Post a bounty</h1>
          <p className="sub">
            Publishing is free and needs no signature. You sign only when you fund a selected developer.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: "12.5px",
              color: "var(--ink-3)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span className="dot" />
            Draft ready
          </span>
          <button type="button" className="btn btn-o btn-sm">
            Save draft
          </button>
        </div>
      </div>

      {/* Stepper Header */}
      <ol className="stepper" aria-label="Steps">
        <li className="on">
          <span className="n">1</span>Basics &amp; scope
        </li>
        <li className="done">
          <span className="n">2</span>Criteria &amp; budget
        </li>
        <li>
          <span className="n">3</span>Repository
        </li>
        <li>
          <span className="n">4</span>Review &amp; publish
        </li>
      </ol>

      {error && <div className="err" role="alert">{error}</div>}

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Section 1: Basics */}
        <section className="form">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>1 · Basics</h2>
            <span className="badge b-open">Step 1</span>
          </div>

          <div className="field">
            <label htmlFor="issue-title">{t("titleLabel")}</label>
            <Input
              id="issue-title"
              className="inp"
              required
              minLength={10}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix reentrancy in StakingVault.withdraw()"
            />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="hint">{t("titleHint")}</span>
              <span className="hint mono">{title.length} / 120</span>
            </div>
          </div>

          <div className="two">
            <div className="field">
              <label htmlFor="issue-category">{t("categoryLabel")}</label>
              <select
                id="issue-category"
                className="inp"
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                {ISSUE_CATEGORIES.map((val) => (
                  <option key={val} value={val}>
                    {categoryNames[val]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <span className="flab">{t("difficultyLabel")}</span>
              <div className="seg" role="radiogroup">
                {ISSUE_DIFFICULTY.map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === diff}
                    className={difficulty === diff ? "on" : ""}
                    onClick={() => setDifficulty(diff)}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="required-skills">{t("skillsLabel")}</label>
            <div className="taginput">
              {skills.map((skill) => (
                <span key={skill} className="tag">
                  {skill}{" "}
                  <button
                    type="button"
                    className="x"
                    onClick={() => removeSkill(skill)}
                    aria-label={`Remove ${skill}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="required-skills"
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addSkills();
                  }
                }}
                placeholder={skills.length ? "Add more, press Enter" : t("skillsPlaceholder")}
              />
              {skillDraft.trim() && (
                <button
                  type="button"
                  className="btn btn-o btn-sm"
                  onClick={() => addSkills()}
                  style={{ height: 26, padding: "0 8px", fontSize: 11 }}
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              )}
            </div>
            <span className="hint">Up to 10 skills. Developers who match will be notified.</span>
          </div>
        </section>

        {/* Section 2: Scope & Acceptance Criteria */}
        <section className="form">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>2 · Scope &amp; Criteria</h2>
            <span className="badge b-prog">In progress</span>
          </div>

          <div className="field">
            <label htmlFor="issue-description">{t("descriptionLabel")}</label>
            <div className="editor">
              <div className="ed-bar" role="toolbar" aria-label="Formatting">
                <button
                  type="button"
                  aria-label="Bold"
                  onClick={() => setDescription((prev) => `${prev}**bold**`)}
                >
                  B
                </button>
                <button
                  type="button"
                  aria-label="Italic"
                  style={{ fontStyle: "italic" }}
                  onClick={() => setDescription((prev) => `${prev}*italic*`)}
                >
                  I
                </button>
                <button
                  type="button"
                  aria-label="Inline code"
                  className="mono"
                  onClick={() => setDescription((prev) => `${prev}\`code\``)}
                >
                  &lt;/&gt;
                </button>
                <button
                  type="button"
                  aria-label="Code block"
                  className="mono"
                  onClick={() => setDescription((prev) => `${prev}\n\`\`\`\n// code\n\`\`\`\n`)}
                >
                  &#123; &#125;
                </button>
                <div className="ed-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    className={editorTab === "write" ? "on" : ""}
                    onClick={() => setEditorTab("write")}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={editorTab === "preview" ? "on" : ""}
                    onClick={() => setEditorTab("preview")}
                  >
                    Preview
                  </button>
                </div>
              </div>

              {editorTab === "write" ? (
                <textarea
                  id="issue-description"
                  className="ed-area"
                  required
                  minLength={30}
                  maxLength={5000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="## Problem&#10;Describe the vulnerability or feature...&#10;&#10;## Acceptance criteria&#10;- Passes all tests on main&#10;- CEI checks-effects-interactions applied"
                />
              ) : (
                <div className="ed-area" style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>
                  {description || "No description provided yet."}
                </div>
              )}

              <div className="ed-foot">
                <span>Markdown supported</span>
                <span className="mono">{description.length} / 5000</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Budget & Deadlines */}
        <section className="form">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>3 · Budget &amp; Deadlines</h2>
            <span className="badge b-info">Base Sepolia</span>
          </div>

          <div className="two">
            <div className="field">
              <label htmlFor="bounty-amount">{t("bountyAmount")}</label>
              <Input
                id="bounty-amount"
                className="inp"
                required
                type="number"
                min={BOUNTY_MIN_AMOUNT}
                max={BOUNTY_MAX_AMOUNT}
                step="any"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <span className="hint">
                {t("allowedRange")}: {BOUNTY_MIN_AMOUNT.toLocaleString()}–{BOUNTY_MAX_AMOUNT.toLocaleString()} tokens.
              </span>
            </div>

            <div className="field">
              <label htmlFor="bounty-token">{t("rewardToken")}</label>
              <select
                id="bounty-token"
                className="inp"
                required
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                disabled={loadingTokens || tokens.length === 0}
              >
                {tokens.length === 0 && <option value="">No supported tokens available</option>}
                {tokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.symbol} · {token.name}
                  </option>
                ))}
              </select>
              <span className="hint">{t("tokenWhitelist")}</span>
            </div>
          </div>

          <div className="two">
            <div className="field">
              <label htmlFor="time-estimate">{t("estimatedDuration")}</label>
              <Input
                id="time-estimate"
                className="inp"
                maxLength={50}
                value={timeEstimate}
                onChange={(e) => setTimeEstimate(e.target.value)}
                placeholder="e.g. 3 days"
              />
            </div>

            <div className="field">
              <label htmlFor="deadline">{t("applicationDeadline")}</label>
              <Input
                id="deadline"
                className="inp"
                type="date"
                min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="github-repo">{t("githubRepository")}</label>
            <Input
              id="github-repo"
              className="inp"
              type="url"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="https://github.com/org/repository"
            />
          </div>
        </section>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
          <Button asChild variant="outline">
            <Link href="/marketplace">{t("cancel")}</Link>
          </Button>
          <div style={{ display: "flex", gap: 10 }}>
            <Button type="button" variant="outline">
              Save as draft
            </Button>
            <Button type="submit" isLoading={saving} disabled={!tokenId || loadingTokens}>
              {t("publishBounty")}
            </Button>
          </div>
        </div>
      </form>
    </main>
  </div>
  );
}
