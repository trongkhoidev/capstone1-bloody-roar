"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, ExternalLink, MapPin, Star } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { Avatar } from "@/components/ui/avatar";

const QUERY = `query PublicProfile($id: ID!) { user(id: $id) { id name avatar bio skills location role walletAddress reputationScore completedTaskCount disputesLost isGithubVerified githubUsername githubUrl linkedinUrl portfolioUrl } }`;
type User = { id: string; name: string | null; avatar: string | null; bio: string | null; skills: string[]; location: string | null; role: string; walletAddress: string; reputationScore: number; completedTaskCount: number; disputesLost: number; isGithubVerified: boolean; githubUsername: string | null; githubUrl: string | null; linkedinUrl: string | null; portfolioUrl: string | null };

export function PublicProfileView({ userId }: { userId: string }) {
  const me = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-profile", userId],
    queryFn: ({ signal }) => graphqlRequest<{ user: User | null }>(QUERY, { id: userId }, signal),
  });
  const u = data?.user;

  if (isLoading) return <div className="wrap py-10 text-[var(--ink-3)]">Loading profile…</div>;
  if (error || !u) return <div className="wrap py-10 text-[var(--ink-3)]">This profile does not exist.</div>;

  const links = [
    u.githubUrl && { label: u.githubUsername ? `@${u.githubUsername}` : "GitHub", href: u.githubUrl },
    u.linkedinUrl && { label: "LinkedIn", href: u.linkedinUrl },
    u.portfolioUrl && { label: "Portfolio", href: u.portfolioUrl },
  ].filter((l): l is { label: string; href: string } => Boolean(l));

  return (
    <div className="wrap py-8 max-w-3xl mx-auto">
      <div className="card p-6 flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <Avatar user={u} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              {u.name || `${u.walletAddress.slice(0, 6)}…${u.walletAddress.slice(-4)}`}
              {u.isGithubVerified && <BadgeCheck className="w-5 h-5 text-[var(--brand)]" aria-label="GitHub verified" />}
            </h1>
            <p className="text-sm text-[var(--ink-3)] flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span className="badge b-info">{u.role === "CLIENT" ? "Client" : u.role === "ADMIN" ? "Admin" : "Developer"}</span>
              {u.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{u.location}</span>}
            </p>
          </div>
          {me?.id === u.id && <Link href="/profile" className="btn btn-sm">Edit profile</Link>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-[var(--surface-2)] p-3"><small className="text-[var(--ink-3)]">Reputation</small><div className="font-bold flex items-center gap-1"><Star className="w-4 h-4" />{u.reputationScore.toFixed(1)}</div></div>
          <div className="rounded-lg bg-[var(--surface-2)] p-3"><small className="text-[var(--ink-3)]">Completed bounties</small><div className="font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{u.completedTaskCount}</div></div>
          <div className="rounded-lg bg-[var(--surface-2)] p-3"><small className="text-[var(--ink-3)]">Disputes lost</small><div className="font-bold">{u.disputesLost}</div></div>
        </div>

        {u.bio && <p className="text-sm whitespace-pre-wrap">{u.bio}</p>}
        {u.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {u.skills.map((s) => <Link key={s} href={`/marketplace?skills=${encodeURIComponent(s)}`} className="gs-tag text-xs">{s}</Link>)}
          </div>
        )}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-3 text-sm">
            {links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--link)]">{l.label}<ExternalLink className="w-3 h-3" /></a>)}
          </div>
        )}
      </div>
    </div>
  );
}
