"use client";

import { uploadFile } from "@/lib/upload";
import { useEffect, useMemo, useState } from "react";
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
const MAX_IMAGES = 4;
const SEARCH_SKILLS = `query Skills($query: String, $first: Int) { skills(query: $query, first: $first) { id name } }`;
const ATTACH_ISSUE_FILE = `mutation AttachIssueFile($issue: ID!, $attachment: ID!) { attachIssueFile(issueId: $issue, attachmentId: $attachment) { id } }`;

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
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const previews = useMemo(() => imageFiles.map((file) => URL.createObjectURL(file)), [imageFiles]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateField = (event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    const messages: Record<string, string> = {
      "issue-title": "Title must contain 10–120 characters.",
      "issue-description": "Scope must contain 30–5000 characters.",
      "bounty-amount": `Reward must be between ${BOUNTY_MIN_AMOUNT} and ${BOUNTY_MAX_AMOUNT}.`,
      deadline: "Deadline must be tomorrow or later.",
    };
    setFieldErrors((current) => ({ ...current, [field.id]: field.validity.valid ? "" : messages[field.id] ?? field.validationMessage }));
  };

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

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      graphqlRequest<{ skills: Array<{ name: string }> }>(SEARCH_SKILLS, { query: skillDraft.trim(), first: 8 })
        .then((result) => { if (active) setSuggestions(result.skills.map((skill) => skill.name)); })
        .catch(() => { if (active) setSuggestions([]); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [skillDraft]);
  const pickSkill = (name: string) => { addSkills(name); setSuggestOpen(false); };

  const addImages = (files: File[]) => {
    const picked = files.filter((file) => file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024);
    if (picked.length < files.length) setError("Only images up to 5 MB can be attached.");
    setImageFiles((current) => [...current, ...picked].slice(0, MAX_IMAGES));
  };

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
    if (title.trim().length < 10 || title.trim().length > 120) {
      setFieldErrors((current) => ({ ...current, "issue-title": "Title must contain 10–120 characters." }));
      document.getElementById("issue-title")?.focus();
      return;
    }
    if (description.trim().length < 30) {
      setEditorTab("write");
      setFieldErrors((current) => ({ ...current, "issue-description": "Scope must contain 30–5000 characters." }));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const input = {
        title: title.trim(),
        description: description.trim(),
        category,
        bountyAmount: String(amount),
        tokenId,
        requiredSkills: skills,
        ...(difficulty ? { difficulty } : {}),
        ...(timeEstimate.trim() ? { timeEstimate: timeEstimate.trim() } : {}),
        ...(deadline ? { expiresAt: new Date(`${deadline}T23:59:59`).toISOString() } : {}),
        ...(githubRepo.trim() ? { githubRepo: githubRepo.trim() } : {}),
      };
      const result = await graphqlRequest<CreateResponse>(CREATE_ISSUE, { input });
      // Images attach after the task exists: each upload is announced without an issue, then linked to it.
      setCreatedId(result.createIssue.id);
      const failed: string[] = [];
      for (const file of imageFiles) {
        try {
          const { attachmentId } = await uploadFile(file, "ISSUE_IMAGE");
          await graphqlRequest(ATTACH_ISSUE_FILE, { issue: result.createIssue.id, attachment: attachmentId });
        } catch {
          failed.push(file.name);
        }
      }
      if (failed.length) {
        setError(`Bounty posted, but these images failed to upload: ${failed.join(", ")}. Open the bounty to continue.`);
        return;
      }
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

  if (user.role === "ADMIN") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 text-sm text-[var(--ink-2)] hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-4 w-4" /> {t("marketplace")}
        </Link>
        <section className="mt-5 form">
          <h1 className="h1" style={{ fontSize: 24, marginTop: 4 }}>
            {t("adminCannotCreateIssue")}
          </h1>
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

      {error && <div className="err" role="alert">{error}{createdId && <> <Link href={`/issues/${createdId}`} style={{ textDecoration: "underline" }}>Open bounty</Link></>}</div>}

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
              onBlur={validateField}
              onInvalid={validateField}
              placeholder="e.g. Fix reentrancy in StakingVault.withdraw()"
            />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="hint">{t("titleHint")}</span>
              <span className="hint mono">{title.length} / 120</span>
            </div>
            {fieldErrors["issue-title"] && <span role="alert" className="err">{fieldErrors["issue-title"]}</span>}
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
            <div style={{ position: "relative" }}>
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
                autoComplete="off"
                role="combobox"
                aria-expanded={suggestOpen && suggestions.length > 0}
                aria-controls="skill-suggestions"
                onChange={(e) => { setSkillDraft(e.target.value); setSuggestOpen(true); }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
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
            {suggestOpen && suggestions.filter((name) => !skills.includes(name)).length > 0 && (
              <ul id="skill-suggestions" role="listbox" style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", marginTop: 4, maxHeight: 240, overflowY: "auto", listStyle: "none", padding: 4, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
                {suggestions.filter((name) => !skills.includes(name)).map((name) => (
                  <li key={name} role="option" aria-selected={false}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickSkill(name)} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, fontSize: 13, color: "var(--ink)", background: "transparent", cursor: "pointer" }} className="hover:bg-[var(--surface-2)]">
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
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
                  onBlur={validateField}
                  onInvalid={validateField}
                  onPaste={(e) => {
                    // Pasted screenshots join the bounty's images; plain-text paste is untouched.
                    const images = Array.from(e.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                    if (images.length) { e.preventDefault(); addImages(images); }
                  }}
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
            {fieldErrors["issue-description"] && <span role="alert" className="err">{fieldErrors["issue-description"]}</span>}
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
                onBlur={validateField}
                onInvalid={validateField}
              />
              <span className="hint">
                {t("allowedRange")}: {BOUNTY_MIN_AMOUNT.toLocaleString()}–{BOUNTY_MAX_AMOUNT.toLocaleString()} tokens.
              </span>
              {fieldErrors["bounty-amount"] && <span role="alert" className="err">{fieldErrors["bounty-amount"]}</span>}
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
                onBlur={validateField}
                onInvalid={validateField}
              />
              {fieldErrors.deadline && <span role="alert" className="err">{fieldErrors.deadline}</span>}
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

        <div>
          <label style={{ fontSize: 13 }}>
            Images (optional, up to {MAX_IMAGES})
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: "block", marginTop: 6 }}
              onChange={(e) => {
                addImages(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Images only, 5 MB each. You can also paste screenshots into the scope box. The first image is the cover in the marketplace.</p>
          {previews.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {previews.map((url, index) => (
                <div key={url} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={imageFiles[index]?.name ?? ""} style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
                  <button type="button" aria-label="Remove image" onClick={() => setImageFiles((current) => current.filter((_, i) => i !== index))} style={{ position: "absolute", top: 2, right: 2, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 4, fontSize: 11, lineHeight: "16px", width: 18, cursor: "pointer" }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
          <Button asChild variant="outline">
            <Link href="/marketplace">{t("cancel")}</Link>
          </Button>
          <div style={{ display: "flex", gap: 10 }}>
            <Button type="button" variant="outline">
              Save as draft
            </Button>
            <Button type="submit" isLoading={saving} disabled={!tokenId || loadingTokens || Boolean(createdId)}>
              {t("publishBounty")}
            </Button>
          </div>
        </div>
      </form>
    </main>
  </div>
  );
}
