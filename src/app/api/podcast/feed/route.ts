// The show's public podcast RSS feed. Spotify (after the 301 redirect from
// Spotify for Creators), Apple Podcasts and any other directory poll this URL
// anonymously (~every 2h) and ingest new items automatically.
//
// Requires the service-role client: the route is public (no user session), and
// it reads via admin so RLS doesn't blank the feed.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function rfc2822(iso: string): string {
  return new Date(iso).toUTCString();
}

function itunesDuration(totalSec: number | null): string | null {
  if (!totalSec || totalSec <= 0) return null;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return new NextResponse("feed unavailable", { status: 503 });

  const [{ data: settings }, { data: episodes }] = await Promise.all([
    admin.from("podcast_settings").select("*").maybeSingle(),
    admin
      .from("episodes")
      .select(
        "id, title, title_chosen, description_chosen, audio_key, audio_size, duration_seconds, spotify_published_at",
      )
      .not("spotify_published_at", "is", null)
      .lte("spotify_published_at", new Date().toISOString())
      .not("audio_key", "is", null)
      .order("spotify_published_at", { ascending: false }),
  ]);

  if (!settings?.title) {
    return new NextResponse("podcast settings not configured", { status: 404 });
  }

  const artwork = settings.artwork_key ? publicUrl(settings.artwork_key as string) : null;
  const siteUrl = (settings.site_url as string | null) || "https://podcast-studio-wxbw.onrender.com";

  const items = (episodes ?? [])
    .map((ep) => {
      const title = (ep.title_chosen as string | null) || (ep.title as string | null) || "פרק";
      const description = (ep.description_chosen as string | null) || "";
      const url = publicUrl(ep.audio_key as string);
      const duration = itunesDuration(ep.duration_seconds as number | null);
      return [
        "    <item>",
        `      <title>${esc(title)}</title>`,
        `      <description>${cdata(description)}</description>`,
        `      <enclosure url="${esc(url)}" length="${ep.audio_size ?? 0}" type="audio/mpeg"/>`,
        `      <guid isPermaLink="false">${ep.id}</guid>`,
        `      <pubDate>${rfc2822(ep.spotify_published_at as string)}</pubDate>`,
        duration ? `      <itunes:duration>${duration}</itunes:duration>` : null,
        `      <itunes:explicit>${settings.explicit ? "true" : "false"}</itunes:explicit>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(settings.title as string)}</title>
    <description>${cdata((settings.description as string) || "")}</description>
    <link>${esc(siteUrl)}</link>
    <language>${esc((settings.language as string) || "he")}</language>
    <itunes:author>${esc((settings.author as string) || "")}</itunes:author>
    <itunes:explicit>${settings.explicit ? "true" : "false"}</itunes:explicit>
    <itunes:category text="${esc((settings.category as string) || "Society & Culture")}"/>
${artwork ? `    <itunes:image href="${esc(artwork)}"/>\n    <image><url>${esc(artwork)}</url><title>${esc(settings.title as string)}</title><link>${esc(siteUrl)}</link></image>` : ""}
${settings.owner_email ? `    <itunes:owner><itunes:name>${esc((settings.author as string) || "")}</itunes:name><itunes:email>${esc(settings.owner_email as string)}</itunes:email></itunes:owner>` : ""}
${items}
  </channel>
</rss>
`;

  return new NextResponse(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
