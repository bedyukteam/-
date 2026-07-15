// studio/src/lib/spotify-csv.ts
export interface SpotifyStats {
  streams: number | null;
  listeners: number | null;
  starts: number | null;
}

function findColumn(headers: string[], keyword: string): number {
  return headers.findIndex((h) => h.toLowerCase().trim().includes(keyword));
}

function sumColumn(lines: string[], col: number): number | null {
  if (col === -1) return null;
  let total = 0;
  for (const line of lines) {
    const n = Number(line.split(",")[col]?.trim());
    if (!Number.isNaN(n)) total += n;
  }
  return total;
}

export function parseSpotifyCsv(csvText: string): SpotifyStats {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("קובץ ה-CSV ריק או לא תקין");

  const headers = lines[0].split(",").map((h) => h.trim());
  const streamsCol = findColumn(headers, "stream");
  const listenersCol = findColumn(headers, "listener");
  const startsCol = findColumn(headers, "start");

  if (streamsCol === -1 && listenersCol === -1 && startsCol === -1) {
    throw new Error(
      "לא נמצאו עמודות מוכרות בקובץ (Streams/Listeners/Starts) — ודאי שזה ייצוא מ-Spotify for Creators",
    );
  }

  const dataLines = lines.slice(1);
  return {
    streams: sumColumn(dataLines, streamsCol),
    listeners: sumColumn(dataLines, listenersCol),
    starts: sumColumn(dataLines, startsCol),
  };
}
