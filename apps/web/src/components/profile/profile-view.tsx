"use client";

import { useEffect, useState } from "react";
import { GitBranch, MapPin, Save, ShieldCheck } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { useUiPreferences } from "@/lib/ui-preferences";

const ME_QUERY = `query MyProfile { me { id name avatar bio skills location role walletAddress reputationScore completedTaskCount isGithubVerified githubUsername attestations { attestationUid schemaUid type chainId attester createdAt revokedAt } } }`;
const UPDATE_PROFILE = `mutation UpdateProfile($input: UpdateProfileInput!) { updateProfile(input: $input) { id name avatar bio skills location role isGithubVerified githubUsername } }`;
type Profile = { id: string; name?: string | null; avatar?: string | null; bio?: string | null; skills: string[]; location?: string | null; role: "CLIENT" | "DEVELOPER" | "ADMIN"; walletAddress: string; reputationScore: number; completedTaskCount: number; isGithubVerified: boolean; githubUsername?: string | null; attestations: Array<{ attestationUid: string; schemaUid: string; type: string; chainId: number; attester: string; createdAt: string; revokedAt?: string | null }> };

export function ProfileView() {
  const authUser = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const { language, t } = useUiPreferences();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [location, setLocation] = useState("");
  const [role, setRole] = useState<"CLIENT" | "DEVELOPER">("DEVELOPER");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authUser) { setLoading(false); return; }
    let active = true;
    void graphqlRequest<{ me: Profile | null }>(ME_QUERY)
      .then(({ me }) => {
        if (!active || !me) return;
        setProfile(me); setName(me.name ?? ""); setAvatar(me.avatar ?? ""); setBio(me.bio ?? ""); setSkillsText(me.skills.join(", ")); setLocation(me.location ?? ""); setRole(me.role === "CLIENT" ? "CLIENT" : "DEVELOPER");
        useAuthStore.setState((state) => state.user ? { user: { ...state.user, ...me } } : state);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load your profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("github") === "connected") setNotice("GitHub account verified and linked.");
    if (params.get("github") === "error") setError("GitHub could not be linked. Check the OAuth configuration and try again.");
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      const result = await graphqlRequest<{ updateProfile: Profile }>(UPDATE_PROFILE, { input: {
        name: name.trim() || null, avatar: avatar.trim() || null, bio: bio.trim() || null,
        location: location.trim() || null,
        ...(profile?.role === "ADMIN" ? {} : { role }),
        skills: [...new Set(skillsText.split(",").map((skill) => skill.trim()).filter(Boolean))].slice(0, 30),
      } });
      setProfile((current) => current ? { ...current, ...result.updateProfile } : result.updateProfile);
      useAuthStore.setState((state) => state.user ? { user: { ...state.user, ...result.updateProfile } } : state);
      setNotice("Profile saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save profile."); }
    finally { setSaving(false); }
  };

  const linkGithub = async () => {
    setError(null);
    try {
      const response = await fetch("/api/auth/github/start", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "GitHub OAuth is not configured.");
      window.location.assign(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start GitHub authorization."); }
  };

  if (authStatus === "restoring") return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8"><div className="h-64 animate-pulse rounded-xl bg-[hsl(var(--card))]" /></main>;
  if (!authUser) return <main className="mx-auto max-w-4xl px-4 py-16"><AuthRequiredPanel title="Build your Bloody-Roar profile" description="Connect your wallet to add your skills, GitHub verification, and the information clients see before selecting a developer." actionLabel="Connect wallet to edit profile" /></main>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="animate-fade-in"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">{language === "vi" ? "Tài khoản" : "Account"}</p><h1 className="mt-1 font-outfit text-3xl font-bold gradient-text">{t("profileHeading")}</h1><p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">{t("profileIntro")}</p></div>
      {error && <div role="alert" className="mt-5 rounded-lg border border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.08)] p-3 text-sm text-[hsl(var(--destructive))]">{error}</div>}
      {notice && <div role="status" className="mt-5 rounded-lg border border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.08)] p-3 text-sm text-[hsl(var(--success))]">{notice}</div>}
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={save} className="space-y-5 glass rounded-xl p-5 sm:p-7 animate-fade-in">
          {loading ? <div className="h-64 animate-pulse rounded-xl bg-[hsl(var(--muted))]" /> : <>
            <Field label={t("displayName")}><Input maxLength={50} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("namePlaceholder")} /></Field>
            <Field label={t("avatarUrl")}><Input type="url" maxLength={500} value={avatar} onChange={(event) => setAvatar(event.target.value)} placeholder="https://…" /></Field>
            <Field label={t("aboutYou")}><textarea className="min-h-32 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background-secondary))] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" maxLength={200} value={bio} onChange={(event) => setBio(event.target.value)} placeholder={t("bioPlaceholder")} /></Field>
            <Field label={t("skillsComma")}><Input value={skillsText} onChange={(event) => setSkillsText(event.target.value)} placeholder="TypeScript, Solidity, UI design" /></Field>
            <Field label={t("locationLabel")}><Input maxLength={80} value={location} onChange={(event) => setLocation(event.target.value)} placeholder={t("locationPlaceholder")} /></Field>
            {profile?.role !== "ADMIN" && <Field label={t("accountRole")}><select value={role} onChange={(event) => setRole(event.target.value as "CLIENT" | "DEVELOPER")} className="block w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background-secondary))] px-3 py-2.5 text-sm"><option value="DEVELOPER">{t("developerRole")}</option><option value="CLIENT">{t("clientRole")}</option></select><span className="mt-1 block text-xs text-[hsl(var(--foreground-muted))]">{t("switchRoles")}</span></Field>}
            <Button type="submit" isLoading={saving}><Save className="mr-2 h-4 w-4" />{t("saveProfile")}</Button>
          </>}
        </form>
        <aside className="space-y-4 animate-fade-in">
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" />{t("trustSignals")}</div>
            <p className="mt-3 text-xs text-[hsl(var(--foreground-muted))]">{t("wallet")}</p><p className="mt-1 break-all font-mono text-xs">{profile?.walletAddress ?? authUser.walletAddress}</p>
            <div className="mt-3 flex items-center justify-between text-sm"><span className="text-[hsl(var(--foreground-muted))]">{t("reputation")}</span><strong>{(profile?.reputationScore ?? authUser.reputationScore).toFixed(1)} / 5</strong></div>
            <div className="mt-2 flex items-center justify-between text-sm"><span className="text-[hsl(var(--foreground-muted))]">{t("completedTasks")}</span><strong>{profile?.completedTaskCount ?? authUser.completedTaskCount}</strong></div>
          </div>
          {profile?.role === "DEVELOPER" && <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-[hsl(var(--accent))]" />{t("verifiableCredentials")}</div>
            {profile.attestations.length ? <div className="mt-3 space-y-3">{profile.attestations.map((attestation) => <article key={attestation.attestationUid} className="rounded-lg border border-[hsl(var(--border))] p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{attestation.type.replaceAll("_", " ")}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${attestation.revokedAt ? "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]" : "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]"}`}>{attestation.revokedAt ? "Revoked" : "Active"}</span></div>
              <p className="mt-2 break-all font-mono text-[10px] text-[hsl(var(--foreground-muted))]">UID: {attestation.attestationUid}</p>
              <p className="mt-1 text-[10px] text-[hsl(var(--foreground-subtle))]">Chain {attestation.chainId} · issued {new Date(attestation.createdAt).toLocaleDateString()}</p>
            </article>)}</div> : <p className="mt-3 text-xs leading-5 text-[hsl(var(--foreground-muted))]">{t("noExternalCredentials")}</p>}
            <p className="mt-3 border-t border-[hsl(var(--border))] pt-3 text-[10px] leading-4 text-[hsl(var(--foreground-subtle))]">{t("platformReputationExplanation")}</p>
          </div>}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 font-semibold"><GitBranch className="h-4 w-4" />{t("github")}</div>
            {profile?.isGithubVerified ? <p className="mt-3 text-sm text-[hsl(var(--success))]">{t("verifiedAs")} @{profile.githubUsername}</p> : <><p className="mt-2 text-xs leading-5 text-[hsl(var(--foreground-muted))]">{t("linkGithubDescription")}</p><Button variant="outline" size="sm" className="mt-4 w-full" onClick={linkGithub}>{t("linkGithub")}</Button></>}
          </div>
          <div className="glass rounded-xl p-4 text-xs text-[hsl(var(--foreground-muted))]"><MapPin className="mb-2 h-4 w-4" />{t("profileDetailsStored")}</div>
        </aside>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium">{label}</span>{children}</label>;
}
