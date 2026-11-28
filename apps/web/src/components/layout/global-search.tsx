"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, BookOpen, Briefcase, CornerDownLeft, LayoutDashboard, Loader2, MapPin, Plus, Search, Star, Tag, X } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { issueStatus } from "@/lib/issue-status";
import { Avatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/store/use-auth-store";

const SEARCH_QUERY = `query GlobalSearch($q: String!) {
  issues(search: $q, first: 5) { totalCount edges { node { id title status requiredSkills bountyAmount { formatted } token { symbol } client { name } } } }
  skills(query: $q, first: 6) { id name category }
  searchUsers(query: $q, first: 4) { id name avatar walletAddress role skills location reputationScore completedTaskCount isGithubVerified githubUsername }
}`;

type Data = {
  issues: { totalCount: number; edges: { node: { id: string; title: string; status: string; requiredSkills: string[]; bountyAmount: { formatted: string }; token: { symbol: string }; client: { name: string | null } } }[] };
  skills: { id: string; name: string; category: string }[];
  searchUsers: { id: string; name: string | null; avatar: string | null; walletAddress: string; role: string; skills: string[]; location: string | null; reputationScore: number; completedTaskCount: number; isGithubVerified: boolean; githubUsername: string | null }[];
};
type Row = { key: string; href: string; group: string };

const useDebounced = (value: string, ms = 250) => {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
};

export function GlobalSearch() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text.trim());

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", q],
    queryFn: ({ signal }) => graphqlRequest<Data>(SEARCH_QUERY, { q }, signal),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });

  // Quick links, filtered by the typed text so the box also works as a command palette.
  const pages = useMemo(() => {
    const all = [
      { label: "Marketplace", href: "/marketplace", icon: Briefcase },
      { label: "Guide", href: "/guide", icon: BookOpen },
      ...(user ? [
        { label: user.role === "ADMIN" ? "Admin" : "My work", href: user.role === "ADMIN" ? "/admin" : "/dashboard", icon: LayoutDashboard },
        { label: "Post a bounty", href: "/issues/create", icon: Plus },
      ] : []),
    ];
    const needle = text.trim().toLowerCase();
    return needle ? all.filter((p) => p.label.toLowerCase().includes(needle)) : all;
  }, [text, user]);

  const issues = q.length >= 2 ? data?.issues.edges ?? [] : [];
  const skills = q.length >= 2 ? data?.skills ?? [] : [];
  const people = q.length >= 2 ? data?.searchUsers ?? [] : [];
  const rows: Row[] = [
    ...issues.map((e) => ({ key: e.node.id, href: `/issues/${e.node.id}`, group: "bounty" })),
    ...people.map((u) => ({ key: u.id, href: `/users/${u.id}`, group: "person" })),
    ...skills.map((s) => ({ key: s.id, href: `/marketplace?skills=${encodeURIComponent(s.name)}`, group: "skill" })),
    ...pages.map((p) => ({ key: p.href, href: p.href, group: "page" })),
    ...(text.trim() ? [{ key: "all", href: `/marketplace?search=${encodeURIComponent(text.trim())}`, group: "all" }] : []),
  ];
  const idx = (group: string, key: string) => rows.findIndex((r) => r.group === group && r.key === key);

  useEffect(() => setActive(0), [q, data]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const hotkey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", hotkey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", hotkey); };
  }, []);

  const go = (href: string) => { setOpen(false); input.current?.blur(); router.push(href); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % Math.max(rows.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + rows.length) % Math.max(rows.length, 1)); }
    else if (e.key === "Enter" && rows[active]) { e.preventDefault(); go(rows[active].href); }
  };

  const searching = q.length >= 2 && isFetching;
  const empty = q.length >= 2 && !isFetching && !issues.length && !skills.length && !people.length;

  return (
    <div ref={box} className="gs search hidden md:flex min-w-[200px] max-w-[380px]" role="search">
      <Search className="gs-ico" aria-hidden />
      <input
        ref={input}
        type="search"
        value={text}
        placeholder="Search bounties, people, skills, pages…"
        aria-label="Global search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {searching ? <Loader2 className="gs-end animate-spin" aria-hidden /> : text ? (
        <button type="button" className="gs-end gs-clear" aria-label="Clear search" onClick={() => { setText(""); input.current?.focus(); }}><X /></button>
      ) : <kbd className="gs-end gs-kbd">⌘K</kbd>}

      {open && (
        <div id={listId} role="listbox" className="gs-pop">
          {issues.length > 0 && (
            <section>
              <h6>Bounties{data && data.issues.totalCount > issues.length ? ` · ${data.issues.totalCount}` : ""}</h6>
              {issues.map(({ node: n }) => {
                const i = idx("bounty", n.id);
                const st = issueStatus(n.status);
                return (
                  <button key={n.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`gs-card ${i === active ? "on" : ""}`}
                    onMouseEnter={() => setActive(i)} onClick={() => go(`/issues/${n.id}`)}>
                    <span className="gs-main">
                      <span className="gs-title">{n.title}</span>
                      <span className="gs-meta">
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                        {n.client.name && <span>by {n.client.name}</span>}
                        {n.requiredSkills.slice(0, 3).map((s) => <span key={s} className="gs-tag">{s}</span>)}
                      </span>
                    </span>
                    <span className="gs-amt">{n.bountyAmount.formatted}<small>{n.token.symbol}</small></span>
                  </button>
                );
              })}
            </section>
          )}
          {people.length > 0 && (
            <section>
              <h6>People</h6>
              {people.map((u) => {
                const i = idx("person", u.id);
                const label = u.name || u.githubUsername || `${u.walletAddress.slice(0, 6)}…${u.walletAddress.slice(-4)}`;
                return (
                  <button key={u.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`gs-card ${i === active ? "on" : ""}`}
                    onMouseEnter={() => setActive(i)} onClick={() => go(`/users/${u.id}`)}>
                    <Avatar user={u} size={34} />
                    <span className="gs-main flex-1">
                      <span className="gs-title">{label}{u.isGithubVerified && <BadgeCheck className="gs-verified" aria-label="GitHub verified" />}</span>
                      <span className="gs-meta">
                        <span className="badge b-info">{u.role === "CLIENT" ? "Client" : u.role === "ADMIN" ? "Admin" : "Developer"}</span>
                        {u.location && <span className="gs-loc"><MapPin aria-hidden />{u.location}</span>}
                        {u.skills.slice(0, 2).map((s) => <span key={s} className="gs-tag">{s}</span>)}
                      </span>
                    </span>
                    <span className="gs-amt gs-rep"><Star aria-hidden />{u.reputationScore.toFixed(1)}<small>{u.completedTaskCount} done</small></span>
                  </button>
                );
              })}
            </section>
          )}
          {skills.length > 0 && (
            <section>
              <h6>Skills</h6>
              <div className="gs-chips">
                {skills.map((s) => {
                  const i = idx("skill", s.id);
                  return (
                    <button key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`gs-chip ${i === active ? "on" : ""}`}
                      onMouseEnter={() => setActive(i)} onClick={() => go(`/marketplace?skills=${encodeURIComponent(s.name)}`)}>
                      <Tag aria-hidden />{s.name}<small>{s.category}</small>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {empty && <p className="gs-empty">No bounties, people or skills match “{q}”.</p>}
          {pages.length > 0 && (
            <section>
              <h6>{text.trim() ? "Pages" : "Quick links"}</h6>
              {pages.map((p) => {
                const i = idx("page", p.href);
                return (
                  <button key={p.href} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`gs-row ${i === active ? "on" : ""}`}
                    onMouseEnter={() => setActive(i)} onClick={() => go(p.href)}>
                    <p.icon aria-hidden />{p.label}
                  </button>
                );
              })}
            </section>
          )}
          {text.trim() && (
            <button id={`${listId}-${idx("all", "all")}`} role="option" aria-selected={idx("all", "all") === active} className={`gs-all ${idx("all", "all") === active ? "on" : ""}`}
              onMouseEnter={() => setActive(idx("all", "all"))} onClick={() => go(`/marketplace?search=${encodeURIComponent(text.trim())}`)}>
              <Search aria-hidden />See all results for “{text.trim()}” in marketplace<CornerDownLeft aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
