"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X } from "lucide-react";
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
  BUG_FIX: "Bug fix", FEATURE: "Feature", SMART_CONTRACT: "Smart contract",
  AUDIT: "Security audit", UI_UX: "UI / UX", DATA_SCIENCE: "Data science",
  DEVOPS: "DevOps", DOCUMENTATION: "Documentation", OTHER: "Other",
};

const fieldClass = "block w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background-secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--foreground-subtle))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]";
const labelClass = "mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]";

export function CreateIssueForm() {
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const { language, t } = useUiPreferences();
  const categoryNames = language === "vi" ? {
    BUG_FIX: "Sửa lỗi", FEATURE: "Tính năng", SMART_CONTRACT: "Smart contract", AUDIT: "Kiểm toán bảo mật",
    UI_UX: "Giao diện", DATA_SCIENCE: "Khoa học dữ liệu", DEVOPS: "DevOps", DOCUMENTATION: "Tài liệu", OTHER: "Khác",
  } : CATEGORY_NAMES;
  const [tokens, setTokens] = useState<Token[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof ISSUE_CATEGORIES)[number]>("BUG_FIX");
  const [amount, setAmount] = useState(100);
  const [tokenId, setTokenId] = useState("");
  const [skillDraft, setSkillDraft] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<(typeof ISSUE_DIFFICULTY)[number] | "">("");
  const [timeEstimate, setTimeEstimate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
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
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load bounty tokens."); })
      .finally(() => { if (active) setLoadingTokens(false); });
    return () => { active = false; };
  }, []);

  const addSkills = (value = skillDraft) => {
    const next = value.split(",").map((item) => item.trim()).filter(Boolean);
    setSkills((current) => [...new Set([...current, ...next])].slice(0, 10));
    setSkillDraft("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const input = {
        title: title.trim(), description: description.trim(), category,
        bountyAmount: Number(amount), tokenId, requiredSkills: skills,
        ...(difficulty ? { difficulty } : {}),
        ...(timeEstimate.trim() ? { timeEstimate: timeEstimate.trim() } : {}),
        ...(deadline ? { expiresAt: new Date(`${deadline}T23:59:59`).toISOString() } : {}),
        ...(githubRepo.trim() ? { githubRepo: githubRepo.trim() } : {}),
      };
      const result = await graphqlRequest<CreateResponse>(CREATE_ISSUE, { input });
      window.location.assign(`/issues/${result.createIssue.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tạo bài toán.");
    } finally { setSaving(false); }
  };

  if (authStatus === "restoring") {
    return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8"><div className="h-7 w-32 animate-pulse rounded bg-[hsl(var(--muted))]" /><div className="mt-5 h-[36rem] animate-pulse rounded-xl bg-[hsl(var(--card))]" /></main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"><ArrowLeft className="h-4 w-4" /> {t("marketplace")}</Link>
        <div className="mt-5 glass rounded-xl p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">{t("createBounty")}</p>
          <h1 className="mt-2 font-outfit text-3xl font-bold gradient-text">{t("describeWork")}</h1>
          <div className="mt-6"><AuthRequiredPanel title={t("connectBeforePosting")} description={t("walletSessionPurpose")} actionLabel={t("connectWallet")} /></div>
        </div>
      </main>
    );
  }

  if (user.role !== "CLIENT") {
    return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8"><Link href="/" className="inline-flex items-center gap-2 text-sm text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"><ArrowLeft className="h-4 w-4" /> {t("marketplace")}</Link><section className="mt-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--foreground-muted))]">{t("clientWorkspace")}</p><h1 className="mt-2 text-2xl font-bold">{t("switchToClient")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--foreground-muted))]">{t("developerRoleExplanation")}</p><Button asChild className="mt-5"><Link href="/profile">{t("openProfileSettings")}</Link></Button></section></main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"><ArrowLeft className="h-4 w-4" /> {t("marketplace")}</Link>
      <div className="mt-5 glass rounded-xl p-5 sm:p-8">
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">{t("createBounty")}</p>
          <h1 className="mt-2 font-outfit text-3xl font-bold gradient-text">{t("describeWork")}</h1>
          <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">{t("clearAcceptance")}</p>
        </div>

        {error && <div role="alert" className="mb-5 rounded-lg border border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.08)] p-3 text-sm text-[hsl(var(--destructive))]">{error}</div>}

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className={labelClass} htmlFor="issue-title">{t("titleLabel")}</label>
            <Input id="issue-title" required minLength={10} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
            <p className="mt-1 text-xs text-[hsl(var(--foreground-subtle))]">{t("titleHint")}</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="issue-description">{t("descriptionLabel")}</label>
            <textarea id="issue-description" className={`${fieldClass} min-h-48 resize-y`} required minLength={30} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} />
            <p className="mt-1 text-xs text-[hsl(var(--foreground-subtle))]">{t("descriptionHint")} · {description.length}/5000</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="issue-category">{t("categoryLabel")}</label>
              <select id="issue-category" className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                {ISSUE_CATEGORIES.map((value) => <option key={value} value={value}>{categoryNames[value]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="issue-difficulty">{t("difficultyLabel")}</label>
              <select id="issue-difficulty" className={fieldClass} value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                <option value="">{t("notSpecified")}</option>
                {ISSUE_DIFFICULTY.map((value) => <option key={value} value={value}>{language === "vi" ? ({ Easy: t("difficultyEasy"), Medium: t("difficultyMedium"), Hard: t("difficultyHard"), Expert: t("difficultyExpert") } as const)[value] : value}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="required-skills">{t("skillsLabel")}</label>
            <div className="flex gap-2">
              <Input id="required-skills" value={skillDraft} onChange={(e) => setSkillDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkills(); } }} placeholder={t("skillsPlaceholder")} />
              <Button type="button" variant="outline" onClick={() => addSkills()} disabled={!skillDraft.trim()} aria-label="Add skills"><Plus className="h-4 w-4" /></Button>
            </div>
            {skills.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{skills.map((skill) => <span key={skill} className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] px-2.5 py-1 text-xs">{skill}<button type="button" onClick={() => setSkills((current) => current.filter((value) => value !== skill))} aria-label={`Remove ${skill}`}><X className="h-3 w-3" /></button></span>)}</div>}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="bounty-amount">{t("bountyAmount")}</label>
              <Input id="bounty-amount" required type="number" min={BOUNTY_MIN_AMOUNT} max={BOUNTY_MAX_AMOUNT} step="any" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              <p className="mt-1 text-xs text-[hsl(var(--foreground-subtle))]">{t("allowedRange")}: {BOUNTY_MIN_AMOUNT.toLocaleString()}–{BOUNTY_MAX_AMOUNT.toLocaleString()} tokens.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="bounty-token">{t("rewardToken")}</label>
              <select id="bounty-token" className={fieldClass} required value={tokenId} onChange={(e) => setTokenId(e.target.value)} disabled={loadingTokens || tokens.length === 0}>
                {tokens.length === 0 && <option value="">No supported tokens available</option>}
                {tokens.map((token) => <option key={token.id} value={token.id}>{token.symbol} · {token.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-[hsl(var(--foreground-subtle))]">{t("tokenWhitelist")}</p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="time-estimate">{t("estimatedDuration")}</label><Input id="time-estimate" maxLength={50} value={timeEstimate} onChange={(e) => setTimeEstimate(e.target.value)} placeholder={t("skillExample")} /></div>
            <div><label className={labelClass} htmlFor="deadline">{t("applicationDeadline")}</label><Input id="deadline" type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          </div>
          <div><label className={labelClass} htmlFor="github-repo">{t("githubRepository")}</label><Input id="github-repo" type="url" value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="https://github.com/org/repository" /></div>

          <div className="flex flex-col-reverse gap-3 border-t border-[hsl(var(--border))] pt-5 sm:flex-row sm:justify-end">
            <Button asChild variant="outline"><Link href="/">{t("cancel")}</Link></Button>
            <Button type="submit" isLoading={saving} disabled={!tokenId || loadingTokens}>{t("publishBounty")}</Button>
          </div>
        </form>
      </div>
    </main>
  );
}
