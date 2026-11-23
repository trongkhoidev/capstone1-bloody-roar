"use client";

import { useToastState } from "@/lib/toast";
import { uploadFile } from "@/lib/upload";
import { shrinkAvatar } from "@/lib/avatar-image";
import { useEffect, useState } from "react";
import { Camera, Save, ShieldCheck } from "lucide-react";
import { graphqlRequest, GraphQLRequestError } from "@/lib/graphql-client";
import { useAuthStore, useAuthStoreApi } from "@/lib/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/ui/location-picker";
import { SkillPicker } from "@/components/ui/skill-picker";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { useUiPreferences } from "@/lib/ui-preferences";

const ME_QUERY = `query MyProfile { me { id name avatar bio skills location role walletAddress reputationScore completedTaskCount isGithubVerified githubUsername githubUrl linkedinUrl portfolioUrl attestations { attestationUid schemaUid type chainId attester createdAt revokedAt } } }`;
const UPDATE_PROFILE = `mutation UpdateProfile($input: UpdateProfileInput!) { updateProfile(input: $input) { id name avatar bio skills location role isGithubVerified githubUsername githubUrl linkedinUrl portfolioUrl } }`;
type Profile = { id: string; name?: string | null; avatar?: string | null; bio?: string | null; skills: string[]; location?: string | null; role: "CLIENT" | "DEVELOPER" | "ADMIN"; walletAddress: string; reputationScore: number; completedTaskCount: number; isGithubVerified: boolean; githubUsername?: string | null; githubUrl?: string | null; linkedinUrl?: string | null; portfolioUrl?: string | null; attestations: Array<{ attestationUid: string; schemaUid: string; type: string; chainId: number; attester: string; createdAt: string; revokedAt?: string | null }> };

export function ProfileView() {
  const authStore = useAuthStoreApi();
  const authUser = useAuthStore((state) => state.user);
  const authUserId = authUser?.id;
  const authStatus = useAuthStore((state) => state.status);
  const { t, theme } = useUiPreferences();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [location, setLocation] = useState("");
  const [role, setRole] = useState<"CLIENT" | "DEVELOPER">("DEVELOPER");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useToastState("error");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [, setNotice] = useToastState("success");

  // The server stores the avatar when the upload completes; the view then reloads the stored URL.
  const uploadAvatar = async (file: File) => {
    setSaving(true); setError(null); setNotice(null);
    try {
      await uploadFile(await shrinkAvatar(file), "AVATAR");
      const { me } = await graphqlRequest<{ me: Profile | null }>(ME_QUERY);
      setAvatar(me?.avatar ?? "");
      setNotice("Photo updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not upload the avatar."); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (!authUserId) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError(null); setNotice(null); setFieldErrors({});
    void graphqlRequest<{ me: Profile | null }>(ME_QUERY)
      .then(({ me }) => {
        if (!active || authStore.getState().user?.id !== authUserId) return;
        if (!me || me.id !== authUserId) throw new Error("Could not load your profile.");
        setProfile(me); setName(me.name ?? ""); setAvatar(me.avatar ?? ""); setBio(me.bio ?? ""); setSkills(me.skills); setGithubUrl(me.githubUrl ?? ""); setLinkedinUrl(me.linkedinUrl ?? ""); setPortfolioUrl(me.portfolioUrl ?? ""); setLocation(me.location ?? ""); setRole(me.role === "CLIENT" ? "CLIENT" : "DEVELOPER");
        authStore.setState((state) => state.user ? { user: { ...state.user, ...me } } : state);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load your profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authStore, authUserId, setError, setNotice]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setFieldErrors({}); setNotice(null);
    try {
      const result = await graphqlRequest<{ updateProfile: Profile }>(UPDATE_PROFILE, { input: {
        name: name.trim() || null, avatar: avatar.trim() || null, bio: bio.trim() || null,
        location: location.trim() || null,
        ...(profile?.role === "ADMIN" ? {} : { role }),
        skills, githubUrl: githubUrl.trim() || null, linkedinUrl: linkedinUrl.trim() || null, portfolioUrl: portfolioUrl.trim() || null,
      } });
      if (authStore.getState().user?.id !== authUserId) return;
      setProfile((current) => current ? { ...current, ...result.updateProfile } : result.updateProfile);
      authStore.setState((state) => state.user ? { user: { ...state.user, ...result.updateProfile } } : state);
      setNotice("Profile saved.");
    } catch (reason) {
      const details = reason instanceof GraphQLRequestError && reason.code === "BAD_USER_INPUT" ? reason.details : null;
      const fields = details && typeof details === "object" && "fieldErrors" in details ? details.fieldErrors : null;
      if (fields && typeof fields === "object" && !Array.isArray(fields)) {
        const entries = Object.entries(fields).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((message: unknown) => typeof message === "string"));
        if (entries.length) setFieldErrors(Object.fromEntries(entries));
        if (!entries.length || entries.some(([field]) => !["name", "avatar", "bio", "skills", "location", "role", "githubUrl", "linkedinUrl", "portfolioUrl"].includes(field))) setError(reason instanceof Error ? reason.message : "Could not save profile.");
      } else setError(reason instanceof Error ? reason.message : "Could not save profile.");
    }
    finally { setSaving(false); }
  };

  if (authStatus === "restoring") return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8"><div className="h-64 animate-pulse rounded-xl bg-[hsl(var(--card))]" /></main>;
  if (!authUser) return <main className="mx-auto max-w-4xl px-4 py-16"><AuthRequiredPanel title="Build your Bloody-Roar profile" description="Connect your wallet to add your skills, GitHub verification, and the information clients see before selecting a developer." actionLabel="Connect wallet to edit profile" /></main>;
  if (profile?.id !== authUserId) return <main className="mx-auto max-w-5xl px-4 py-8">{!loading && error ? <p role="alert">{error}</p> : <div className="h-64 animate-pulse rounded-xl bg-[hsl(var(--card))]" />}</main>;

  const walletText = profile?.walletAddress ?? authUser.walletAddress;
  const shownName = name.trim() || `${walletText.slice(0, 6)}…${walletText.slice(-4)}`;
  const card = "rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6";
  const heading = "mb-4 text-sm font-semibold text-[var(--ink)]";
  const inputCls = "block w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background-secondary))] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]";

  return (
    <div className={`br min-h-screen py-8 ${theme === "dark" ? "dark" : ""}`}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">

        <form onSubmit={save} className="space-y-4 animate-fade-in">
          {loading ? <div className="h-64 animate-pulse rounded-xl bg-[hsl(var(--muted))]" /> : <>
            {/* Identity header: avatar, name and the numbers clients look at first */}
            <section className={`${card} flex flex-col items-center gap-5 sm:flex-row`}>
              <label className="group relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-full border border-[var(--line)] bg-[var(--sunk)]" title="Upload photo">
                {avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                  : <span className="grid h-full w-full place-items-center text-3xl font-bold text-[var(--ink-3)]">{shownName.slice(0, 1).toUpperCase()}</span>}
                <span className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100"><Camera className="h-5 w-5" /></span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" aria-label="Upload photo" disabled={saving} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.target.value = ""; }} />
              </label>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h1 className="truncate font-outfit text-2xl font-bold text-[var(--ink)]">{shownName}</h1>
                <p className="mt-1 break-all font-mono text-xs text-[var(--ink-3)]">{walletText}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm sm:justify-start">
                  <span><strong>{(profile?.reputationScore ?? authUser.reputationScore).toFixed(1)}</strong> <span className="text-[var(--ink-3)]">/ 5 {t("reputation")}</span></span>
                  <span><strong>{profile?.completedTaskCount ?? authUser.completedTaskCount}</strong> <span className="text-[var(--ink-3)]">{t("completedTasks")}</span></span>
                  {profile?.isGithubVerified && <span className="inline-flex items-center gap-1 text-[hsl(var(--success))]"><ShieldCheck className="h-4 w-4" />@{profile.githubUsername}</span>}
                </div>
              </div>
            </section>

            <section className={card}>
              <h2 className={heading}>{t("profileHeading")}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("displayName")} error={fieldErrors.name}><Input maxLength={50} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("namePlaceholder")} /></Field>
                <Field label={t("locationLabel")} error={fieldErrors.location}><LocationPicker value={location} onChange={setLocation} placeholder="Search a city or country" /></Field>
              </div>
              <div className="mt-4">
                <Field label={t("aboutYou")} error={fieldErrors.bio}>
                  <textarea className={`${inputCls} min-h-24`} maxLength={200} value={bio} onChange={(event) => setBio(event.target.value)} placeholder={t("bioPlaceholder")} />
                  <span className="mt-1 block text-right text-xs text-[var(--ink-3)]">{bio.length}/200</span>
                </Field>
              </div>
            </section>

            <section className={card}>
              <h2 className={heading}>Skills</h2>
              <SkillPicker value={skills} onChange={setSkills} max={30} placeholder="TypeScript, Solidity, UI design" />
              {fieldErrors.skills?.map((message) => <span key={message} role="alert" className="mt-1 block text-sm text-[hsl(var(--destructive))]">{message}</span>)}
              <p className="mt-2 text-xs text-[var(--ink-3)]">Up to 30 skills. Bounties that match your skills notify you.</p>
            </section>

            <section className={card}>
              <h2 className={heading}>Links</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="GitHub" error={fieldErrors.githubUrl}><Input type="url" maxLength={300} value={githubUrl} onChange={(event) => setGithubUrl(event.target.value)} placeholder="https://github.com/you" /></Field>
                <Field label="LinkedIn" error={fieldErrors.linkedinUrl}><Input type="url" maxLength={300} value={linkedinUrl} onChange={(event) => setLinkedinUrl(event.target.value)} placeholder="https://linkedin.com/in/you" /></Field>
                <div className="sm:col-span-2"><Field label="Portfolio" error={fieldErrors.portfolioUrl}><Input type="url" maxLength={300} value={portfolioUrl} onChange={(event) => setPortfolioUrl(event.target.value)} placeholder="https://your-site.com" /></Field></div>
              </div>
            </section>

            {profile && profile.role !== "ADMIN" && <section className={card}>
              <Field label="Display label" error={fieldErrors.role}><select value={role} onChange={(event) => setRole(event.target.value as "CLIENT" | "DEVELOPER")} className={inputCls}><option value="DEVELOPER">{t("developerRole")}</option><option value="CLIENT">{t("clientRole")}</option></select><span className="mt-1 block text-xs text-[hsl(var(--foreground-muted))]">Does not change permissions</span></Field>
            </section>}

            {profile && profile.role !== "ADMIN" && profile.attestations.length > 0 && <section className={card}>
              <h2 className={heading}>{t("verifiableCredentials")}</h2>
              <div className="space-y-3">{profile.attestations.map((attestation) => <article key={attestation.attestationUid} className="rounded-lg border border-[hsl(var(--border))] p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{attestation.type.replaceAll("_", " ")}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${attestation.revokedAt ? "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]" : "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]"}`}>{attestation.revokedAt ? "Revoked" : "Active"}</span></div>
                <p className="mt-2 break-all font-mono text-[10px] text-[hsl(var(--foreground-muted))]">UID: {attestation.attestationUid}</p>
              </article>)}</div>
            </section>}

            <div className="sticky bottom-4 flex justify-end"><Button type="submit" isLoading={saving} className="shadow-lg"><Save className="mr-2 h-4 w-4" />{t("saveProfile")}</Button></div>
          </>}
        </form>
      </main>
    </div>
  );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string[] | undefined }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium">{label}</span>{children}{error?.map((message) => <span key={message} role="alert" className="mt-1 block text-sm text-[hsl(var(--destructive))]">{message}</span>)}</label>;
}
