/**
 * Crunchyroll Service
 * Fetches latest episodes using anonymous auth
 * Supports authenticated login for subtitle downloads
 */

import crypto from "crypto";
import type {
    CrunchyrollAuth,
    CrunchyrollEpisodes,
    CrunchyrollEpisode,
    FormattedEpisode,
    CrunchyrollSubtitle,
    CrunchyrollPlayResponse,
    CrunchyrollBrowseItem,
    CrunchyrollBrowseResponse,
    LineupAnnouncement
} from "../types/crunchyroll";
import { LANG_MAP, CR_RELEASE_ITEMS_PER_PAGE, CRUNCHYROLL_BASIC_AUTH, CRUNCHYROLL_USER_AGENT } from "../constants";
import { config } from "../config";
import { logger } from "../core/logger";
import { fetchWithTimeout } from "../utils/http";
import { parseXml, xmlNodeArray, xmlAttr, type XmlNode } from "../utils/xml";

// Cache for anonymous auth token
let cachedAuth: CrunchyrollAuth | null = null;
let authExpiresAt = 0;

// In-flight anonymous auth request — deduplicated so concurrent callers on token
// expiry share a single password/client_id grant instead of stampeding the API.
let anonymousAuthPromise: Promise<CrunchyrollAuth | null> | null = null;

// Cache for account auth token (premium)
let cachedAccountAuth: CrunchyrollAuth | null = null;
let accountAuthExpiresAt = 0;

// In-flight account auth request — same stampede protection as above.
let accountAuthPromise: Promise<CrunchyrollAuth | null> | null = null;

/**
 * Service for interacting with Crunchyroll APIs (Discovery, Search, Subtitles, etc.).
 * Supports both anonymous auth and account-based premium auth.
 */
export class CrunchyrollService {
    private readonly subtitleCollator = new Intl.Collator("en", { sensitivity: "base" });

    private readonly API_BASE = "https://beta-api.crunchyroll.com";
    private basicAuth = CRUNCHYROLL_BASIC_AUTH;
    private userAgent = CRUNCHYROLL_USER_AGENT;

    /**
     * Deterministic device ID derived from config seed.
     * Prevents Crunchyroll from treating each login as a new device (causing security email spam).
     */
    private static get deviceId(): string {
        const seed =
            config.crunchyroll.email || config.security.tokenEncryptionKey || "autoclaim-bot-crunchyroll-device";
        const hash = crypto.createHash("sha256").update(`cr-device-id:${seed}`).digest("hex");
        const timeLow = hash.substring(0, 8);
        const timeMid = hash.substring(8, 12);
        const timeHiAndVersion = `4${hash.substring(13, 16)}`;
        const clockSeq =
            ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") +
            hash.substring(18, 20);
        const node = hash.substring(20, 32);
        return `${timeLow}-${timeMid}-${timeHiAndVersion}-${clockSeq}-${node}`;
    }

    /**
     * Get auth token (cached). Concurrent callers share a single in-flight request.
     */
    async getAuth(forceRefresh = false): Promise<CrunchyrollAuth | null> {
        if (forceRefresh) {
            cachedAuth = null;
            authExpiresAt = 0;
            anonymousAuthPromise = null;
        } else if (cachedAuth && Date.now() < authExpiresAt) {
            return cachedAuth;
        }

        if (!anonymousAuthPromise) {
            anonymousAuthPromise = this.requestAnonymousAuth().finally(() => {
                anonymousAuthPromise = null;
            });
        }
        return anonymousAuthPromise;
    }

    /**
     * Perform the anonymous client_id grant and populate the cache.
     */
    private async requestAnonymousAuth(): Promise<CrunchyrollAuth | null> {
        try {
            const body = new URLSearchParams();
            body.append("grant_type", "client_id");
            body.append("device_id", CrunchyrollService.deviceId);

            const response = await fetchWithTimeout(`${this.API_BASE}/auth/v1/token`, {
                timeoutMs: 10000,
                method: "POST",
                headers: {
                    Authorization: `Basic ${this.basicAuth}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": this.userAgent
                },
                body: body.toString()
            });

            if (!response.ok) {
                logger.error(`Crunchyroll auth failed: ${response.status}`);
                return null;
            }

            const auth = (await response.json()) as CrunchyrollAuth;
            if (!auth.access_token) {
                logger.error("Crunchyroll auth: no access token");
                return null;
            }

            // Cache with 30s buffer
            cachedAuth = auth;
            authExpiresAt = Date.now() + (auth.expires_in - 30) * 1000;

            return auth;
        } catch (error) {
            logger.error(error as Error, "Crunchyroll auth error");
            return null;
        }
    }

    /**
     * Fetch the latest episodes from Crunchyroll browse API.
     * @param lang - Locale parameter for language preference.
     * @param count - Number of episodes to return.
     * @returns A promise resolving to an array of Crunchyroll episodes.
     */
    async fetchLatestEpisodes(lang = "", count = CR_RELEASE_ITEMS_PER_PAGE): Promise<CrunchyrollEpisode[]> {
        const auth = await this.getAuth();
        if (!auth) return [];

        try {
            const params = new URLSearchParams({
                n: count.toString(),
                type: "episode",
                sort_by: "newly_added",
                force_locale: crypto.randomUUID()
            });
            if (lang && lang.trim()) {
                params.append("locale", lang);
            }

            const response = await fetchWithTimeout(`${this.API_BASE}/content/v2/discover/browse?${params}`, {
                timeoutMs: 15000,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": this.userAgent,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    Pragma: "no-cache",
                    Expires: "0"
                }
            });

            if (!response.ok) {
                logger.error(`Crunchyroll fetch failed: ${response.status}`);
                return [];
            }

            const data = (await response.json()) as CrunchyrollEpisodes;
            if (!data.data || data.data.length === 0) {
                return [];
            }

            // Sort by release date (newest first)
            // Pre-compute timestamps to avoid creating multiple Date objects per comparison
            const withTimestamps = data.data.map(ep => ({
                ep,
                timestamp: new Date(
                    ep.episode_metadata.premium_available_date ??
                        ep.episode_metadata.availability_starts ??
                        ep.last_public
                ).getTime()
            }));
            return withTimestamps.toSorted((a, b) => b.timestamp - a.timestamp).map(({ ep }) => ep);
        } catch (error) {
            logger.error(error as Error, "Crunchyroll fetch error");
            return [];
        }
    }

    /**
     * Fetch latest episodes from RSS feed
     * Returns an array of external episode IDs (UUIDs) extracted from the links.
     */
    async fetchLatestEpisodesFromRss(): Promise<string[]> {
        try {
            const response = await fetchWithTimeout("https://www.crunchyroll.com/rss/anime", {
                timeoutMs: 10000,
                headers: {
                    "User-Agent": CRUNCHYROLL_USER_AGENT
                }
            });

            if (!response.ok) {
                logger.error(`Failed to fetch RSS: ${response.status}`);
                return [];
            }

            const xml = await response.text();

            // Extract links and then UUIDs
            const linkRegex = /<link>([^<]+)<\/link>/g;
            const uuids: string[] = [];

            let match;
            while ((match = linkRegex.exec(xml)) !== null) {
                const link = match[1];
                if (!link || !link.includes("/watch/")) continue;

                const parts = link.split("/watch/");
                if (parts.length > 1 && parts[1]) {
                    const uuid = parts[1].split("/")[0];
                    if (uuid && uuid.length > 5 && !uuids.includes(uuid)) {
                        uuids.push(uuid);
                    }
                }
            }

            return uuids;
        } catch (error) {
            logger.error(error as Error, "Error fetching RSS for episodes");
            return [];
        }
    }

    /**
     * Fetch multiple Crunchyroll episodes by their unique IDs.
     * @param episodeIds - Array of episode ID strings.
     * @returns A promise resolving to an array of matching Crunchyroll episodes.
     */
    async fetchEpisodesByIds(episodeIds: string[]): Promise<CrunchyrollEpisode[]> {
        const auth = await this.getAuth();
        if (!auth) return [];

        try {
            const results = await Promise.all(
                episodeIds.map(async id => {
                    try {
                        const res = await fetchWithTimeout(
                            `${this.API_BASE}/content/v2/cms/objects/${id}?locale=en-US`,
                            {
                                timeoutMs: 10000,
                                headers: {
                                    Authorization: `Bearer ${auth.access_token}`,
                                    "User-Agent": this.userAgent
                                }
                            }
                        );
                        if (!res.ok) return null;
                        const data = (await res.json()) as { data: CrunchyrollEpisode[] };
                        return data.data?.[0] || null;
                    } catch (error) {
                        logger.error(error as Error, `Error fetching episode ${id}`);
                        return null;
                    }
                })
            );

            return results.filter((ep): ep is CrunchyrollEpisode => ep !== null);
        } catch (error) {
            logger.error(error as Error, "Error fetching episodes by IDs");
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
        const sortedThumbs =
            thumbs.length > 0 ? thumbs.toSorted((a, b) => b.width * b.height - a.width * a.height) : [];
        const thumbnail = sortedThumbs.length > 0 ? sortedThumbs[0]!.source : "";

        // Format duration
        const duration = this.formatDuration(meta.duration_ms);

        const subtitles = this.formatSubtitleLocales(meta.subtitle_locales);

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
        if (minutes > 0) formatted += `${minutes}m`;
        if (seconds > 0 || (hours === 0 && minutes === 0)) formatted += `${seconds}s`;

        return formatted;
    }

    /**
     * Formats subtitle locales for Discord embed output.
     * Arabic variants are pinned first and each label is wrapped in bidi isolate markers
     * so mixed RTL/LTR language lists render in a stable order.
     */
    private formatSubtitleLocales(locales: string[] | undefined): string {
        if (!locales || locales.length === 0) return "-";

        const unique = Array.from(new Set(locales));
        const sorted = unique.toSorted((a, b) => {
            const aIsArabic = a.toLowerCase().startsWith("ar");
            const bIsArabic = b.toLowerCase().startsWith("ar");

            if (aIsArabic !== bIsArabic) {
                return aIsArabic ? -1 : 1;
            }

            const aLabel = LANG_MAP[a] || a;
            const bLabel = LANG_MAP[b] || b;
            return this.subtitleCollator.compare(aLabel, bLabel);
        });

        return sorted.map(loc => `\u2068${LANG_MAP[loc] || loc}\u2069`).join(", ");
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
            const response = await fetchWithTimeout("https://www.crunchyroll.com/rss/anime", {
                timeoutMs: 10000,
                headers: {
                    "User-Agent": CRUNCHYROLL_USER_AGENT
                }
            });

            if (!response.ok) {
                logger.error(`Failed to fetch RSS: ${response.status}`);
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
            logger.info(`Cached ${CrunchyrollService.publisherCache.size} publishers from RSS`);
        } catch (error) {
            logger.error(error as Error, "Error fetching RSS publishers");
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
        try {
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
        } catch (error) {
            logger.error(error as Error, "Error enriching with publisher");
            return episodes;
        }
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
            const response = await fetchWithTimeout(`${this.API_BASE}/content/v2/cms/objects/${seriesId}`, {
                timeoutMs: 10000,
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": this.userAgent
                }
            });

            if (!response.ok) {
                logger.error(`Failed to fetch series ${seriesId}: ${response.status}`);
                return undefined;
            }

            interface PosterImage {
                height: number;
                width: number;
                source: string;
            }
            interface SeriesObject {
                images?: {
                    poster_tall?: PosterImage[][];
                };
            }
            interface SeriesResponse {
                data?: SeriesObject[];
            }
            const data = (await response.json()) as SeriesResponse;
            const images = data?.data?.[0]?.images?.poster_tall; // Array of arrays of images

            if (images && images.length > 0) {
                // Get the largest image from the last array group (usually highest quality)
                const imageGroup = images[images.length - 1];
                if (imageGroup && imageGroup.length > 0) {
                    // Sort by height descending just to be sure
                    const sorted = imageGroup.toSorted((a: PosterImage, b: PosterImage) => b.height - a.height);
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
            logger.error(error as Error, `Error fetching series poster for ${seriesId}`);
        }

        return undefined;
    }

    /**
     * Enrich episodes with series posters
     */
    async enrichWithSeriesPoster(episodes: FormattedEpisode[]): Promise<FormattedEpisode[]> {
        try {
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
        } catch (error) {
            logger.error(error as Error, "Error enriching with series poster");
            return episodes;
        }
    }

    /**
     * Get auth token using Crunchyroll account credentials (premium access).
     * Supports grant_type=refresh_token (preferred) and grant_type=password fallback.
     * Concurrent callers share a single in-flight request.
     */
    async getAccountAuth(forceRefresh = false): Promise<CrunchyrollAuth | null> {
        if (forceRefresh) {
            cachedAccountAuth = null;
            accountAuthExpiresAt = 0;
            accountAuthPromise = null;
        } else if (cachedAccountAuth && Date.now() < accountAuthExpiresAt) {
            return cachedAccountAuth;
        }

        if (!accountAuthPromise) {
            accountAuthPromise = this.requestAccountAuth().finally(() => {
                accountAuthPromise = null;
            });
        }
        return accountAuthPromise;
    }

    /**
     * Perform the password grant and populate the cache.
     */
    private async requestAccountAuth(): Promise<CrunchyrollAuth | null> {
        const email = config.crunchyroll.email;
        const password = config.crunchyroll.password;

        if (!email || !password) {
            logger.error("CR_EMAIL or CR_PASSWORD not configured");
            return null;
        }

        try {
            const body = new URLSearchParams();
            body.append("grant_type", "password");
            body.append("username", email);
            body.append("password", password);
            body.append("scope", "offline_access");
            body.append("device_id", CrunchyrollService.deviceId);
            body.append("device_type", "Android TV");

            const response = await fetchWithTimeout(`${this.API_BASE}/auth/v1/token`, {
                timeoutMs: 10000,
                method: "POST",
                headers: {
                    Authorization: `Basic ${this.basicAuth}`,
                    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                    "User-Agent": this.userAgent
                },
                body: body.toString()
            });

            if (!response.ok) {
                logger.error(`Crunchyroll account auth failed: ${response.status}`);
                return null;
            }

            const auth = (await response.json()) as CrunchyrollAuth;
            if (!auth.access_token) {
                logger.error("Crunchyroll account auth: no access token");
                return null;
            }

            // Cache with 30s buffer
            cachedAccountAuth = auth;
            accountAuthExpiresAt = Date.now() + (auth.expires_in - 30) * 1000;

            return auth;
        } catch (error) {
            logger.error(error as Error, "Crunchyroll account auth error");
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

            const response = await fetchWithTimeout(`${this.API_BASE}/content/v2/discover/search?${params}`, {
                timeoutMs: 15000,
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": this.userAgent
                }
            });

            if (!response.ok) {
                logger.error(`Crunchyroll search failed: ${response.status}`);
                return [];
            }

            const data = (await response.json()) as {
                data: { type: string; items: { id: string; title: string; slug_title: string }[] }[];
            };

            // Find series results
            const seriesResults = data.data?.find(d => d.type === "series");
            if (!seriesResults?.items?.length) return [];

            // Prefer exact title match if available, otherwise use first result
            const exactMatch = seriesResults.items.find(s => s.title.toLowerCase() === query.trim().toLowerCase());
            const series = exactMatch || seriesResults.items[0]!;

            // Fetch episodes using the new method
            return await this.fetchEpisodesBySeriesId(series.id, episodeNumber);
        } catch (error) {
            logger.error(error as Error, "Crunchyroll search error");
            return [];
        }
    }

    /**
     * Search series and return autocomplete results
     */
    async searchSeriesAutocomplete(query: string): Promise<{ name: string; value: string }[]> {
        if (!query || query.length < 2) return [];

        const auth = (await this.getAccountAuth()) || (await this.getAuth());
        if (!auth) return [];

        try {
            const params = new URLSearchParams({
                q: query,
                n: "25",
                type: "series"
            });

            const response = await fetchWithTimeout(`${this.API_BASE}/content/v2/discover/search?${params}`, {
                timeoutMs: 5000,
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": this.userAgent
                }
            });

            if (!response.ok) return [];

            const data = (await response.json()) as {
                data: { type: string; items: { id: string; title: string; slug_title: string }[] }[];
            };

            const seriesResults = data.data?.find(d => d.type === "series");
            if (!seriesResults?.items?.length) return [];

            return seriesResults.items.map(s => ({
                name: s.title.substring(0, 100),
                value: s.title.substring(0, 100)
            }));
        } catch (error) {
            logger.error(error as Error, "Crunchyroll autocomplete error");
            return [];
        }
    }

    /**
     * Fetch episodes for a series ID across all relevant seasons
     */
    async fetchEpisodesBySeriesId(seriesId: string, episodeNumber?: number): Promise<CrunchyrollEpisode[]> {
        const auth = (await this.getAccountAuth()) || (await this.getAuth());
        if (!auth) return [];

        try {
            // Fetch seasons for this series
            const seasonsRes = await fetchWithTimeout(
                `${this.API_BASE}/content/v2/cms/series/${seriesId}/seasons?locale=en-US`,
                {
                    timeoutMs: 15000,
                    headers: {
                        Authorization: `Bearer ${auth.access_token}`,
                        "User-Agent": this.userAgent
                    }
                }
            );

            if (!seasonsRes.ok) return [];

            const seasonsData = (await seasonsRes.json()) as {
                data: { id: string; title: string; audio_locale: string }[];
            };

            if (!seasonsData.data?.length) return [];

            // Prefer Japanese audio seasons (original), or fallback to all seasons
            const jpSeasons = seasonsData.data.filter(s => s.audio_locale === "ja-JP");
            const targetSeasons = jpSeasons.length > 0 ? jpSeasons : seasonsData.data;

            // Fetch episodes for all target seasons in parallel
            const episodeArrays = await Promise.all(
                targetSeasons.map(async season => {
                    try {
                        const episodesRes = await fetchWithTimeout(
                            `${this.API_BASE}/content/v2/cms/seasons/${season.id}/episodes?locale=en-US`,
                            {
                                timeoutMs: 15000,
                                headers: {
                                    Authorization: `Bearer ${auth.access_token}`,
                                    "User-Agent": this.userAgent
                                }
                            }
                        );
                        if (!episodesRes.ok) return [];
                        const episodesData = (await episodesRes.json()) as { data: CrunchyrollEpisode[] };
                        return episodesData.data || [];
                    } catch {
                        return [];
                    }
                })
            );

            const allEpisodes = episodeArrays.flat();
            if (allEpisodes.length === 0) return [];

            // Filter by episode number if provided
            if (episodeNumber !== undefined) {
                return allEpisodes.filter(
                    ep =>
                        ep.episode_number === episodeNumber ||
                        ep.episode === String(episodeNumber) ||
                        ep.episode_metadata?.episode_number === episodeNumber ||
                        ep.episode_metadata?.episode === String(episodeNumber)
                );
            }

            return allEpisodes;
        } catch (error) {
            logger.error(error as Error, "Crunchyroll series episodes fetch error");
            return [];
        }
    }

    /**
     * Fetch subtitles for an episode using premium account auth with fallback to client auth
     * Returns subtitle map from cr-play-service
     */
    async fetchSubtitles(episodeId: string): Promise<Record<string, CrunchyrollSubtitle> | null> {
        const auth = (await this.getAccountAuth()) || (await this.getAuth());
        if (!auth) return null;

        try {
            const url = `https://cr-play-service.prd.crunchyrollsvc.com/v1/${episodeId}/tv/android_tv/play`;
            let response = await fetchWithTimeout(url, {
                timeoutMs: 20000,
                headers: {
                    Authorization: `Bearer ${auth.access_token}`,
                    "User-Agent": this.userAgent
                }
            });

            // If 401/403, invalidate token cache and retry ONCE with fresh token
            if (response.status === 401 || response.status === 403) {
                logger.warn(`Crunchyroll play service returned ${response.status}, refreshing token...`);
                cachedAccountAuth = null;
                accountAuthExpiresAt = 0;
                accountAuthPromise = null;
                cachedAuth = null;
                authExpiresAt = 0;
                anonymousAuthPromise = null;

                const freshAuth = (await this.getAccountAuth(true)) || (await this.getAuth(true));
                if (freshAuth) {
                    response = await fetchWithTimeout(url, {
                        timeoutMs: 20000,
                        headers: {
                            Authorization: `Bearer ${freshAuth.access_token}`,
                            "User-Agent": this.userAgent
                        }
                    });
                }
            }

            if (!response.ok) {
                logger.error(`Crunchyroll play service failed: ${response.status}`);
                return null;
            }

            const data = (await response.json()) as CrunchyrollPlayResponse;
            if (data.subtitles) {
                for (const key of Object.keys(data.subtitles)) {
                    const sub = data.subtitles[key];
                    if (sub) {
                        if (sub.url) {
                            sub.url = this.sanitizeSubtitleUrl(sub.url);
                        }
                        if (sub.format === "txt") {
                            sub.format = "ass";
                        }
                    }
                }
            }
            return data.subtitles || null;
        } catch (error) {
            logger.error(error as Error, "Crunchyroll subtitle fetch error");
            return null;
        }
    }

    /**
     * Sanitize Crunchyroll subtitle URL by replacing modified CDN hosts with original hosts
     * (e.g. vod-fy-mod. -> vod-fy.)
     */
    sanitizeSubtitleUrl(url: string): string {
        if (url.includes("vod-fy-mod.")) {
            return url.replace(/vod-fy-mod\./g, "vod-fy.");
        }
        return url.replace(/vod-([a-zA-Z0-9]+)-mod\.crunchyrollcdn\.com/g, "vod-$1.crunchyrollcdn.com");
    }

    /**
     * Download a single subtitle file content
     * Returns the raw subtitle text (.ass format)
     */
    async downloadSubtitle(url: string): Promise<string | null> {
        try {
            let targetUrl = this.sanitizeSubtitleUrl(url);
            let response = await fetchWithTimeout(targetUrl, { timeoutMs: 15000 });

            // If 403 Forbidden or failed and original URL contains vod-fy-mod., retry replacing vod-fy-mod. with vod-fy.
            if ((!response.ok || response.status === 403) && url.includes("vod-fy-mod.")) {
                targetUrl = url.replace(/vod-fy-mod\./g, "vod-fy.");
                response = await fetchWithTimeout(targetUrl, { timeoutMs: 15000 });
            }

            if (!response.ok) return null;
            return await response.text();
        } catch (error) {
            logger.error(error as Error, "Subtitle download error");
            return null;
        }
    }

    /**
     * Fetch seasonal series from Browse API with pagination
     * @param seasonTag - e.g. "spring-2026", "winter-2026"
     * @param locale - content locale
     * @returns Array of all series for the given season
     */
    async fetchSeasonalSeries(seasonTag: string, locale = "en-US"): Promise<CrunchyrollBrowseItem[]> {
        const auth = await this.getAuth();
        if (!auth) return [];

        const allSeries: CrunchyrollBrowseItem[] = [];
        const pageSize = 100;
        let start = 0;

        try {
            while (true) {
                const params = new URLSearchParams({
                    seasonal_tag: seasonTag,
                    n: String(pageSize),
                    start: String(start),
                    locale
                });

                const response = await fetchWithTimeout(`${this.API_BASE}/content/v2/discover/browse?${params}`, {
                    timeoutMs: 15000,
                    headers: {
                        Authorization: `Bearer ${auth.access_token}`,
                        "User-Agent": this.userAgent
                    }
                });

                if (!response.ok) {
                    logger.error(`Crunchyroll seasonal fetch failed with status: ${response.status}`);
                    return allSeries;
                }

                const data = (await response.json()) as CrunchyrollBrowseResponse;
                const items = data.data ?? [];
                allSeries.push(...items);

                // Stop if we've fetched all items or got fewer than requested
                if (allSeries.length >= data.total || items.length < pageSize) {
                    break;
                }

                start += pageSize;
            }

            return allSeries;
        } catch (error) {
            logger.error(error as Error, "Crunchyroll seasonal fetch error");
            return allSeries;
        }
    }

    /**
     * Fetch seasonal lineup announcements or news from Crunchyroll RSS feed
     */
    async fetchLineupAnnouncements(onlySeasonal = true): Promise<LineupAnnouncement[]> {
        try {
            const response = await fetchWithTimeout("https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss", {
                timeoutMs: 10000,
                headers: {
                    "User-Agent": this.userAgent
                }
            });

            if (!response.ok) {
                logger.error(`Failed to fetch news RSS: ${response.status}`);
                return [];
            }

            const xml = await response.text();
            const channel = (parseXml(xml).rss as XmlNode | undefined)?.channel as XmlNode | undefined;
            const items = xmlNodeArray(channel?.item);

            const announcements: LineupAnnouncement[] = [];

            for (const item of items) {
                const title = String(item.title || "");
                const url = String(item.link || "");

                if (onlySeasonal) {
                    const isSeasonal =
                        /Season Lineup|Lineup Announced|Anime Season Lineup/i.test(title) ||
                        /seasonal-lineup/i.test(url);
                    if (!isSeasonal) continue;
                }

                const description = String(item.description || "");
                const author =
                    (typeof item.author === "string"
                        ? item.author
                        : typeof item["dc:creator"] === "string"
                          ? item["dc:creator"]
                          : null) || null;
                const thumbnail = xmlAttr(item["media:thumbnail"] as XmlNode | undefined, "url");
                const pubDate = String(item.pubDate || new Date().toUTCString());

                announcements.push({
                    title,
                    url,
                    description,
                    author,
                    thumbnail,
                    pubDate
                });
            }

            return announcements;
        } catch (error) {
            logger.error(error as Error, "Error fetching lineup announcements");
            return [];
        }
    }

    /**
     * Fetch latest season lineup announcements or news from Crunchyroll RSS feed
     */
    async fetchLatestLineupAnnouncement(onlySeasonal = true): Promise<LineupAnnouncement | null> {
        const announcements = await this.fetchLineupAnnouncements(onlySeasonal);
        return announcements[0] || null;
    }
}
