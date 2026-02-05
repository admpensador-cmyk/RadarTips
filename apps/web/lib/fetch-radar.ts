import { RadarDayPayload } from "@/lib/radar-types";

const DEFAULT_BASE = "https://radartips.com/data";

export async function fetchRadarDay(): Promise<RadarDayPayload> {
  const base = process.env.RADARTIPS_DATA_BASE_URL || DEFAULT_BASE;
  const url = `${base.replace(/\/$/, "")}/radar/day.json`;

  const res = await fetch(url, {
    // Let Cloudflare cache work. Revalidate periodically on the server.
    next: { revalidate: 60 },
    headers: { "accept": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch radar day (${res.status})`);
  }

  return (await res.json()) as RadarDayPayload;
}
