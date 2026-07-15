// studio/src/components/IdeasView.tsx
// "רעיונות לתוכן" — quotes, carousels and content ideas from every episode,
// grouped by source episode. Approval (★) and edits reuse the same
// /api/generations routes the episode dashboard uses.
"use client";

import { useMemo, useState } from "react";
import type { Generation, GenerationKind } from "@/lib/types";
import { KIND_LABELS } from "@/lib/constants";
import { CarouselCard, TextItem } from "@/components/EpisodeView";

export interface IdeasEpisode {
  id: string;
  title: string | null;
  type: string | null;
  created_at: string;
}

const IDEA_KINDS: GenerationKind[] = ["quote", "carousel", "idea"];

export default function IdeasView({
  episodes,
  generations,
  initialEpisodeId,
}: {
  episodes: IdeasEpisode[];
  generations: Generation[];
  initialEpisodeId?: string;
}) {
  const [gens, setGens] = useState<Generation[]>(generations);
  const [filter, setFilter] = useState<string>(initialEpisodeId ?? "all");

  async function toggleSelect(gen: Generation) {
    const next = !gen.selected;
    setGens((gs) => gs.map((g) => (g.id === gen.id ? { ...g, selected: next } : g)));
    await fetch(`/api/generations/${gen.id}/select`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selected: next }),
    });
  }

  async function saveEdit(gen: Generation, content: Record<string, unknown>) {
    setGens((gs) => gs.map((g) => (g.id === gen.id ? { ...g, content } : g)));
    await fetch(`/api/generations/${gen.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  // Only episodes that actually have idea-content, newest first.
  const episodesWithContent = useMemo(() => {
    const withGens = new Set(gens.map((g) => g.episode_id));
    return episodes.filter((e) => withGens.has(e.id));
  }, [episodes, gens]);

  const visibleEpisodes =
    filter === "all" ? episodesWithContent : episodesWithContent.filter((e) => e.id === filter);

  if (episodesWithContent.length === 0) {
    return (
      <p className="text-muted text-sm bg-surface border border-border rounded-2xl p-6">
        עדיין אין רעיונות לתוכן. העלי פרק — הציטוטים, הקרוסלות והרעיונות שלו יופיעו כאן.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* episode filter */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          כל הפרקים
        </FilterChip>
        {episodesWithContent.map((e) => (
          <FilterChip key={e.id} active={filter === e.id} onClick={() => setFilter(e.id)}>
            {e.type === "short" ? "🎬 " : "🎙 "}
            {e.title || "ללא כותרת"}
          </FilterChip>
        ))}
      </div>

      {visibleEpisodes.map((ep) => {
        const epGens = gens.filter((g) => g.episode_id === ep.id);
        return (
          <section key={ep.id} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-on-navy">
                {ep.type === "short" ? "🎬" : "🎙"} {ep.title || "ללא כותרת"}
              </h2>
              <span className="text-xs text-muted-on-navy">
                {new Date(ep.created_at).toLocaleDateString("he-IL")}
              </span>
              <a href={`/episodes/${ep.id}`} className="text-xs text-accent hover:underline">
                לדף הפרק ←
              </a>
            </div>

            {IDEA_KINDS.map((kind) => {
              const items = epGens.filter((g) => g.kind === kind);
              if (items.length === 0) return null;
              return (
                <div key={kind} className="bg-surface border border-border rounded-2xl p-5">
                  <h3 className="font-bold mb-3">{KIND_LABELS[kind]}</h3>
                  <div className="flex flex-col gap-2">
                    {items.map((g) =>
                      kind === "carousel" ? (
                        <CarouselCard key={g.id} gen={g} onToggleSelect={toggleSelect} />
                      ) : (
                        <TextItem
                          key={g.id}
                          gen={g}
                          editable={kind !== "idea"}
                          onToggleSelect={toggleSelect}
                          onSaveEdit={saveEdit}
                        />
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs rounded-full px-3 py-1.5 border transition max-w-56 truncate ${
        active
          ? "bg-accent text-accent-foreground border-accent font-semibold"
          : "border-border-navy text-on-navy hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}
