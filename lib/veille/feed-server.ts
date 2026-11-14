/** Everything the veille found, on the server: read once per instance from data/build/feed.json. */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Feed } from "@/lib/veille/watch";

let feed: Feed | null = null;

export function serverFeed(): Feed {
  if (!feed) {
    try {
      feed = JSON.parse(readFileSync(path.join(process.cwd(), "data", "build", "feed.json"), "utf8")) as Feed;
    } catch {
      feed = { updated: null, scanned: {}, hits: [] }; // not built yet (npm run veille -- --reassess)
    }
  }
  return feed;
}
