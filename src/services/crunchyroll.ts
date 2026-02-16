/**
 * Crunchyroll Service
 * Fetches latest episodes using anonymous auth
 * Supports authenticated login for subtitle downloads
 */

import type {
    CrunchyrollAuth,
    CrunchyrollEpisodes,
    CrunchyrollEpisode,
    FormattedEpisode,
    CrunchyrollSubtitle,
    CrunchyrollPlayResponse
} from "../types/crunchyroll";
import { LANG_MAP } from "../constants";

// Cache for anonymous auth token
let cachedAuth: CrunchyrollAuth | null = null;
let authExpiresAt = 0;

// Cache for account auth token (premium)
let cachedAccountAuth: CrunchyrollAuth | null = null;
let accountAuthExpiresAt = 0;

export class CrunchyrollService {
    private readonly API_BASE = "https://beta-api.crunchyroll.com";
    // Hardcoded Android TV client credentials (anonymous access)
    private readonly BASIC_AUTH = "bmR0aTZicXlqcm9wNXZnZjF0dnU6elpIcS00SEJJVDlDb2FMcnBPREJjRVRCTUNHai1QNlg=";
    private readonly USER_AGENT =
        "Crunchyroll/ANDROIDTV/3.50.0_22282 (Android 12; en-US; SHIELD Android TV Build/SR1A.211012.001)";

    /**
     * Get auth token (cached)
     */
    async getAuth(): Promise<CrunchyrollAuth | null> {
        // Return cached token if valid
        if (cachedAuth && Date.now() < authExpiresAt) {
            return cachedAuth;
        }

        try {
            const body = new URLSearchParams();
            body.append("grant_type", "client_id");
            body.append("device_id", crypto.randomUUID());

            const response = await fetch(`${this.API_BASE}/auth/v1/token`, {
                method: "POST",
                headers: {
                    Authorization: `Basic ${this.BASIC_AUTH}`,
                    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                    "User-Agent": this.USER_AGENT
                },
                body: body.toString()
            });

            if (!response.ok) {
                console.error("Crunchyroll auth failed:", response.status);
                return null;
            }

            const auth = (await response.json()) as CrunchyrollAuth;
            if (!auth.access_token) {
                console.error("Crunchyroll auth: no access token");
                return null;
            }

            // Cache with 30s buffer
            cachedAuth = auth;
            authExpiresAt = Date.now() + (auth.expires_in - 30) * 1000;

            return auth;
        } catch (error) {
            console.error("Crunchyroll auth error:", error);
            return null;
        }
    }

    /**
     * Fetch latest episodes
     */
    async fetchLatestEpisodes(lang = "en-US", count = 50): Promise<CrunchyrollEpisode[]> {
        const auth = await this.getAuth();
        if (!auth) return [];

        try {
            const params = new URLSearchParams({
                n: count.toString(),
                type: "episode",
                sort_by: "newly_added",
                locale: lang,
                force_locale: crypto.randomUUID()
            });

            const response = await fetch(`${this.API_BASE}/content/v2/discover/browse?${params}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": this.USER_AGENT,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    Pragma: "no-cache",
                    Expires: "0"
                }
            });

            if (!response.ok) {
                console.error("Crunchyroll fetch failed:", response.status);
                return [];
            }

            const data = (await response.json()) as CrunchyrollEpisodes;
            if (!data.data || data.data.length === 0) {
                return [];
            }

            // Sort by release date (newest first)
            return data.data.sort((a, b) => {
                const dateA = new Date(
                    a.episode_metadata.premium_available_date ?? a.episode_metadata.availability_starts ?? a.last_public
                ).getTime();
                const dateB = new Date(
                    b.episode_metadata.premium_available_date ?? b.episode_metadata.availability_starts ?? b.last_public
                ).getTime();
                return dateB - dateA;
            });
        } catch (error) {
            console.error("Crunchyroll fetch error:", error);
            return [];
        }
    }

    /**
     * Format episode for Discord embed
     */
    formatEpisode(ep: CrunchyrollEpisode): FormattedEpisode {
        const meta = ep.episode_metadata;

        // Build title: Series Title (Dub) - Episode X - Episode Title
        let title =
            meta.season_title && !meta.season_title.startsWith("Season") ? meta.season_title : meta.series_title;

        // Add season info if applicable
        if (meta.season_title && meta.season_title.startsWith("Season")) {
            title += this.formatSeasonName(meta.season_title);
        }

        // Add dub indicator if not original audio
        const isDub =
            meta.audio_locale &&
            meta.versions?.length > 0 &&
            !meta.versions.find(v => v.audio_locale === meta.audio_locale)?.original;

        if (isDub && LANG_MAP[meta.audio_locale] && !meta.season_title?.includes(" Dub")) {
            title += ` (${LANG_MAP[meta.audio_locale]} Dub)`;
        }

        // Add episode number and title
        if (meta.episode) {
            title += ` - Episode ${meta.episode}`;
        }
        if (ep.title && !/^Episode\s+0*\d+$/i.test(ep.title)) {
            // Avoid appending if episode title is just the series title
            if (ep.title !== meta.series_title) {
                title += ` - ${ep.title}`;
            }
        }

        // Get best thumbnail
        const thumbs = ep.images?.thumbnail?.flat() ?? [];
        const sortedThumbs = thumbs.length > 0 ? thumbs.sort((a, b) => b.width * b.height - a.width * a.height) : [];
        const thumbnail = sortedThumbs.length > 0 ? sortedThumbs[0]!.source : "";

        // Format duration
        const duration = this.formatDuration(meta.duration_ms);

        // Format subtitles - convert locale codes to language names
        const subtitles =
            meta.subtitle_locales?.length > 0 ? meta.subtitle_locales.map(loc => LANG_MAP[loc] || loc).join(", ") : "-";

        return {
            id: ep.id,
            title,
            url: `https://www.crunchyroll.com/watch/${ep.id}/${ep.slug_title}`,
            description: ep.description || "No description",
            thumbnail,
            episodeId: ep.id,
            seasonId: meta.season_id,
            seriesId: meta.series_id,
            seriesTitle: meta.series_title,
            seasonTitle: meta.season_title,
            episodeNumber: meta.episode,
            duration,
            isDub: Boolean(isDub),
            audioLocale: meta.audio_locale,
            subtitles,
            releasedAt: new Date(meta.premium_available_date || meta.availability_starts || ep.last_public)
        };
    }

    /**
     * Format season name (remove "Season 1" if just Season 1)
     */
    private formatSeasonName(name: string): string {
        const match = name.match(/^Season\s+(\d+)(?:\s*\((.+)\))?$/);
        if (match) {
            const num = parseInt(match[1]!, 10);
            const extra = match[2];

            if (num === 1) {
                return extra ? ` ${extra}` : "";
            }
            return ` ${name}`;
        }
        return ` ${name}`;
    }

    /**
     * Format duration from ms to readable string
     */
    private formatDuration(ms: number | undefined): string {
        if (!ms) return "0s";

        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        let formatted = "";
        if (hours > 0) formatted += `${hours}h`;
        if (minutes > 0 || hours > 0) formatted += `${minutes}m`;
        formatted += `${seconds}s`;

        return formatted;
    }

    // Series poster cache: seriesId -> posterUrl (capped)
    private static readonly MAX_SERIES_CACHE = 200;
    private static seriesCache: Map<string, string> = new Map();

    // RSS publisher cache: mediaId -> publisher (replaced on each fetch, no cap needed)
    private static publisherCache: Map<string, string> = new Map();
    private static rssCacheTime = 0;
    private static readonly RSS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /** Prune seriesCache when it exceeds limit (evict oldest entries) */
    private static pruneSeriesCache(): void {
        if (CrunchyrollService.seriesCache.size <= CrunchyrollService.MAX_SERIES_CACHE) return;
        const excess = CrunchyrollService.seriesCache.size - CrunchyrollService.MAX_SERIES_CACHE;
        let removed = 0;
        for (const key of CrunchyrollService.seriesCache.keys()) {
            if (removed >= excess) break;
            CrunchyrollService.seriesCache.delete(key);
            removed++;
        }
    }

    /**
     * Fetch publisher info from RSS feed
     * Returns a map of mediaId -> publisher
     */
    async fetchRssPublishers(): Promise<Map<string, string>> {
        // Return cache if still valid
        if (
            CrunchyrollService.publisherCache.size > 0 &&
            Date.now() - CrunchyrollService.rssCacheTime < CrunchyrollService.RSS_CACHE_TTL
        ) {
            return CrunchyrollService.publisherCache;
        }

        try {
            const response = await fetch("https://www.crunchyroll.com/rss/anime", {
                headers: {
                    "User-Agent": "Crunchyroll/3.50.0"
                }
            });

            if (!response.ok) {
                console.error("Failed to fetch RSS:", response.status);
                return CrunchyrollService.publisherCache;
            }

            const xml = await response.text();

            // Clear old cache before re-populating
            CrunchyrollService.publisherCache.clear();

            // Simple regex parsing for publisher and mediaId
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            const mediaIdRegex = /<crunchyroll:mediaId>(\d+)<\/crunchyroll:mediaId>/;
            const publisherRegex = /<crunchyroll:publisher>([^<]+)<\/crunchyroll:publisher>/;

            let match;
            while ((match = itemRegex.exec(xml)) !== null) {
                const itemXml = match[1];
                if (!itemXml) continue;

                const mediaIdMatch = mediaIdRegex.exec(itemXml);
                const publisherMatch = publisherRegex.exec(itemXml);

                if (mediaIdMatch?.[1] && publisherMatch?.[1]) {
                    CrunchyrollService.publisherCache.set(mediaIdMatch[1], publisherMatch[1]);
                }
            }

            CrunchyrollService.rssCacheTime = Date.now();
            console.log(`Cached ${CrunchyrollService.publisherCache.size} publishers from RSS`);
        } catch (error) {
            console.error("Error fetching RSS publishers:", error);
        }

        return CrunchyrollService.publisherCache;
    }

    /**
     * Get publisher for an episode by its external_id (e.g., "EPI.976534")
     */
    getPublisher(externalId: string): string | undefined {
        const mediaId = externalId?.split(".")[1];
        if (!mediaId) return undefined;
        return CrunchyrollService.publisherCache.get(mediaId);
    }

    /**
     * Enrich formatted episodes with publisher info
     */
    async enrichWithPublisher(
        episodes: FormattedEpisode[],
        rawEpisodes: CrunchyrollEpisode[]
    ): Promise<FormattedEpisode[]> {
        await this.fetchRssPublishers();

        return episodes.map((ep, index) => {
            const raw = rawEpisodes[index];
            if (raw?.external_id) {
                const publisher = this.getPublisher(raw.external_id);
                if (publisher) {
                    return { ...ep, publisher };
                }
            }
            return ep;
        });
    }

    /**
     * Get series poster (tall) by series ID
     */
    async getSeriesPoster(seriesId: string): Promise<string | undefined> {
        if (!seriesId) return undefined;

        // Check cache first
        if (CrunchyrollService.seriesCache.has(seriesId)) {
            return CrunchyrollService.seriesCache.get(seriesId);
        }

        const auth = await this.getAuth();
        if (!auth) return undefined;

        try {
            const response = await fetch(`${this.API_BASE}/content/v2/cms/objects/${seriesId}`, {
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": this.USER_AGENT
                }
            });

            if (!response.ok) {
                console.error(`Failed to fetch series ${seriesId}:`, response.status);
                return undefined;
            }

            const data = (await response.json()) as any;
            const images = data?.data?.[0]?.images?.poster_tall; // Array of arrays of images

            if (images && images.length > 0) {
                // Get the largest image from the last array group (usually highest quality)
                const imageGroup = images[images.length - 1];
                if (imageGroup && imageGroup.length > 0) {
                    // Sort by height descending just to be sure
                    const sorted = imageGroup.sort((a: any, b: any) => b.height - a.height);
                    // Prefer height around 400-800 for Discord thumbnail, but largest is usually fine
                    const poster = sorted[0]?.source;
                    if (poster) {
                        CrunchyrollService.seriesCache.set(seriesId, poster);
                        CrunchyrollService.pruneSeriesCache();
                        return poster;
                    }
                }
            }
        } catch (error) {
            console.error(`Error fetching series poster for ${seriesId}:`, error);
        }

        return undefined;
    }

    /**
     * Enrich episodes with series posters
     */
    async enrichWithSeriesPoster(episodes: FormattedEpisode[]): Promise<FormattedEpisode[]> {
        // Collect unique series IDs
        const seriesIds = [...new Set(episodes.map(ep => ep.seriesId))];

        // Fetch posters in parallel (with limit if needed, but usually fine for small batches)
        await Promise.all(seriesIds.map(id => this.getSeriesPoster(id)));

        return episodes.map(ep => {
            const poster = CrunchyrollService.seriesCache.get(ep.seriesId);
            if (poster) {
                return { ...ep, seriesPoster: poster };
            }
            return ep;
        });
    }

    /**
     * Get auth token using Crunchyroll account credentials (premium access)
     * Required for accessing streams/subtitles
     */
    async getAccountAuth(): Promise<CrunchyrollAuth | null> {
        // Return cached token if valid
        if (cachedAccountAuth && Date.now() < accountAuthExpiresAt) {
            return cachedAccountAuth;
        }

        const email = process.env.CR_EMAIL;
        const password = process.env.CR_PASSWORD;

        if (!email || !password) {
            console.error("CR_EMAIL or CR_PASSWORD not configured");
            return null;
        }

        try {
            const body = new URLSearchParams();
            body.append("grant_type", "password");
            body.append("username", email);
            body.append("password", password);
            body.append("scope", "offline_access");
            body.append("device_id", crypto.randomUUID());
            body.append("device_type", "Android TV");

            const response = await fetch(`${this.API_BASE}/auth/v1/token`, {
                method: "POST",
                headers: {
                    Authorization: `Basic ${this.BASIC_AUTH}`,
                    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                    "User-Agent": this.USER_AGENT
                },
                body: body.toString()
            });

            if (!response.ok) {
                console.error("Crunchyroll account auth failed:", response.status);
                return null;
            }

            const auth = (await response.json()) as CrunchyrollAuth;
            if (!auth.access_token) {
                console.error("Crunchyroll account auth: no access token");
                return null;
            }

            // Cache with 30s buffer
            cachedAccountAuth = auth;
            accountAuthExpiresAt = Date.now() + (auth.expires_in - 30) * 1000;

            return auth;
        } catch (error) {
            console.error("Crunchyroll account auth error:", error);
            return null;
        }
    }

    /**
     * Search episodes by anime title and episode number
     * Returns matching episodes from the browse API
     */
    async searchEpisode(query: string, episodeNumber?: number): Promise<CrunchyrollEpisode[]> {
        const auth = await this.getAuth();
        if (!auth) return [];

        try {
            const params = new URLSearchParams({
                q: query,
                n: "25",
                type: "series",
                locale: "en-US"
            });

            const response = await fetch(`${this.API_BASE}/content/v2/discover/search?${params}`, {
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": this.USER_AGENT
                }
            });

            if (!response.ok) {
                console.error("Crunchyroll search failed:", response.status);
                return [];
            }

            const data = (await response.json()) as {
                data: { type: string; items: { id: string; title: string; slug_title: string }[] }[];
            };

            // Find series results
            const seriesResults = data.data?.find(d => d.type === "series");
            if (!seriesResults?.items?.length) return [];

            // Get the first matching series
            const series = seriesResults.items[0]!;

            // Fetch seasons for this series
            const seasonsRes = await fetch(`${this.API_BASE}/content/v2/cms/series/${series.id}/seasons?locale=en-US`, {
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": this.USER_AGENT
                }
            });

            if (!seasonsRes.ok) return [];

            const seasonsData = (await seasonsRes.json()) as {
                data: { id: string; title: string; audio_locale: string }[];
            };

            if (!seasonsData.data?.length) return [];

            // Find the Japanese audio season (original)
            const jpSeason = seasonsData.data.find(s => s.audio_locale === "ja-JP") || seasonsData.data[0]!;

            // Fetch episodes for this season
            const episodesRes = await fetch(
                `${this.API_BASE}/content/v2/cms/seasons/${jpSeason.id}/episodes?locale=en-US`,
                {
                    headers: {
                        Authorization: `Bearer ${auth.access_token}`,
                        "User-Agent": this.USER_AGENT
                    }
                }
            );

            if (!episodesRes.ok) return [];

            const episodesData = (await episodesRes.json()) as { data: CrunchyrollEpisode[] };

            if (!episodesData.data?.length) return [];

            // Filter by episode number if provided
            if (episodeNumber !== undefined) {
                return episodesData.data.filter(
                    ep =>
                        ep.episode_metadata?.episode_number === episodeNumber ||
                        ep.episode_metadata?.episode === String(episodeNumber)
                );
            }

            return episodesData.data;
        } catch (error) {
            console.error("Crunchyroll search error:", error);
            return [];
        }
    }

    /**
     * Fetch subtitles for an episode using premium account auth
     * Returns subtitle map from cr-play-service
     */
    async fetchSubtitles(episodeId: string): Promise<Record<string, CrunchyrollSubtitle> | null> {
        const auth = await this.getAccountAuth();
        if (!auth) return null;

        try {
            const url = `https://cr-play-service.prd.crunchyrollsvc.com/v1/${episodeId}/web/firefox/play`;
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0"
                }
            });

            if (!response.ok) {
                console.error("Crunchyroll play service failed:", response.status);
                return null;
            }

            const data = (await response.json()) as CrunchyrollPlayResponse;
            return data.subtitles || null;
        } catch (error) {
            console.error("Crunchyroll subtitle fetch error:", error);
            return null;
        }
    }

    /**
     * Download a single subtitle file content
     * Returns the raw subtitle text (.ass format)
     */
    async downloadSubtitle(url: string): Promise<string | null> {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            return await response.text();
        } catch (error) {
            console.error("Subtitle download error:", error);
            return null;
        }
    }
}
