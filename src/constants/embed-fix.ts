/**
 * Embed Fix Constants
 * Configuration and detection patterns for social media platforms
 */

import { PlatformId, type PlatformConfig } from "../types/embed-fix";
import { NEKOBT_EMBED_COLOR, NEKOBT_TORRENT_REGEX } from "./nekobt";
import { TSUKIHIME_EMBED_COLOR } from "./tsukihime";

/** Platform configurations with patterns and fixes */
export const PLATFORMS: PlatformConfig[] = [
    {
        id: PlatformId.TWITTER,
        name: "Twitter/X",
        color: 0x1da1f2,
        patterns: [
            /https?:\/\/(?:[a-z0-9-]+\.)*(?:twitter|x)\.com\/(?:\w+|i\/web)\/status\/(\d+)/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*(?:fxtwitter|fixupx|vxtwitter)\.com\/\w+\/status\/(\d+)/i
        ],
        fixes: [
            { oldDomain: /https?:\/\/(?:[a-z0-9-]+\.)*twitter\.com/i, newDomain: "https://fxtwitter.com" },
            { oldDomain: /https?:\/\/(?:[a-z0-9-]+\.)*x\.com/i, newDomain: "https://fixupx.com" }
        ]
    },
    {
        id: PlatformId.TIKTOK,
        name: "TikTok",
        color: 0x000000,
        patterns: [
            /https?:\/\/(?:[a-z0-9-]+\.)*tiktok\.com\/@[\w.]+\/(?:video|photo)\/\d+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*tiktok\.com\/t\/\w+/i,
            /https?:\/\/(?:vm|vt)\.tiktok\.com\/\w+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*tiktok\.com\/v\/\d+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*(?:tnktok|vxtiktok)\.com\/@[\w.]+\/(?:video|photo)\/\d+/i
        ],
        fixes: [
            { oldDomain: /https?:\/\/(?:www\.|m\.)?tiktok\.com/i, newDomain: "https://tnktok.com" },
            { oldDomain: /https?:\/\/(?:vm|vt)\.tiktok\.com/i, newDomain: "https://vm.tnktok.com" },
            { oldDomain: /https?:\/\/(?:[a-z0-9-]+\.)*tiktok\.com/i, newDomain: "https://tnktok.com" }
        ]
    },
    {
        id: PlatformId.REDDIT,
        name: "Reddit",
        color: 0xff4500,
        patterns: [
            /https?:\/\/(?:[a-z0-9-]+\.)*reddit\.com\/r\/\w+\/comments\/\w+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*reddit\.com\/r\/\w+\/s\/\w+/i,
            /https?:\/\/redd\.it\/\w+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*(?:vxreddit|rxddit)\.com\/r\/\w+\/comments\/\w+/i
        ],
        fixes: [
            { oldDomain: /https?:\/\/(?:[a-z0-9-]+\.)*reddit\.com/i, newDomain: "https://vxreddit.com" },
            { oldDomain: /https?:\/\/redd\.it/i, newDomain: "https://rxddit.com" }
        ]
    },
    {
        id: PlatformId.INSTAGRAM,
        name: "Instagram",
        color: 0xe1306c,
        patterns: [
            /https?:\/\/(?:[a-z0-9-]+\.)*instagram\.com\/(?:p|reel|reels|tv)\/[\w-]+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*instagram\.com\/share\/(?:p|reel|reels?|r)\/[\w-]+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*(?:eeinstagram|ddinstagram)\.com\/(?:p|reel|reels|tv)\/[\w-]+/i
        ],
        fixes: [{ oldDomain: /https?:\/\/(?:[a-z0-9-]+\.)*instagram\.com/i, newDomain: "https://eeinstagram.com" }]
    },
    {
        id: PlatformId.PIXIV,
        name: "Pixiv",
        color: 0x0096fa,
        patterns: [
            /https?:\/\/(?:[a-z0-9-]+\.)*pixiv\.net(?:\/\w+)?\/artworks\/\d+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*pixiv\.net\/member_illust\.php\?.*illust_id=\d+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*phixiv\.net(?:\/\w+)?\/artworks\/\d+/i
        ],
        fixes: [{ oldDomain: /https?:\/\/(?:[a-z0-9-]+\.)*pixiv\.net/i, newDomain: "https://phixiv.net" }]
    },
    {
        id: PlatformId.BLUESKY,
        name: "Bluesky",
        color: 0x0085ff,
        patterns: [
            /https?:\/\/(?:[a-z0-9-]+\.)*bsky\.app\/profile\/[\w.:-]+\/post\/\w+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*fxbsky\.app\/profile\/[\w.:-]+\/post\/\w+/i
        ],
        fixes: [{ oldDomain: /https?:\/\/(?:[a-z0-9-]+\.)*bsky\.app/i, newDomain: "https://fxbsky.app" }]
    },
    {
        id: PlatformId.THREADS,
        name: "Threads",
        color: 0x000000,
        patterns: [
            /https?:\/\/(?:[a-z0-9-]+\.)*threads\.net\/@?[\w.]+\/post\/[\w-]+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*fixthreads\.net\/@?[\w.]+\/post\/[\w-]+/i
        ],
        fixes: [{ oldDomain: /https?:\/\/(?:[a-z0-9-]+\.)*threads\.net/i, newDomain: "https://fixthreads.net" }]
    },
    {
        id: PlatformId.FACEBOOK,
        name: "Facebook",
        color: 0x1877f2,
        patterns: [
            // Supported by Facebed: /:user/posts/:(id|hash)
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/[\w.]+\/posts\/[\w]+/i,
            // Supported: /share/p/:hash (posts) and /share/v/:hash (videos - partial support) and /share/r/:hash (reels)
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/share\/(?:v|p|r)\/\w+/i,
            // Supported: /groups/:id/posts/:(id|hash)
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/groups\/\d+\/posts\/[\w]+/i,
            // Supported: /permalink.php?story_fbid and /story.php?story_fbid
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/(?:permalink|story)\.php\?story_fbid/i,
            // Reels (supported)
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/(?:reel|reels)\/[\w]+/i,
            // Videos and watch
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/[\w.]+\/videos\/\d+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/watch\/?/i,
            // fb.watch short links
            /https?:\/\/(?:www\.)?fb\.watch\/\w+/i,
            // facebed URLs
            /https?:\/\/(?:www\.)?facebed\.com\/.+/i
        ],
        fixes: [
            { oldDomain: /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com/i, newDomain: "https://www.facebed.com" },
            { oldDomain: /https?:\/\/(?:www\.)?fb\.watch/i, newDomain: "https://www.facebed.com" }
        ]
    },
    {
        id: PlatformId.WEIBO,
        name: "Weibo",
        color: 0xdf2029,
        patterns: [
            /https?:\/\/(www\.|m\.)?weibo\.(com|cn)\/\d+\/\w+/i,
            /https?:\/\/(www\.|m\.)?weibo\.(com|cn)\/detail\/\d+/i
        ],
        fixes: [] // Rich embed only, no domain replacement
    },
    {
        id: PlatformId.MISSKEY,
        name: "Misskey",
        color: 0x96d04a,
        patterns: [/https?:\/\/[\w.]+\/notes\/\w+/i],
        fixes: [] // Rich embed only
    },
    {
        id: PlatformId.PLURK,
        name: "Plurk",
        color: 0xff574d,
        patterns: [/https?:\/\/(www\.)?plurk\.com\/p\/\w+/i],
        fixes: [] // Rich embed only
    },
    {
        id: PlatformId.NYAA,
        name: "Nyaa.si",
        color: 0x0089ff,
        patterns: [/https?:\/\/(www\.)?nyaa\.si\/view\/\d+/i, /https?:\/\/(www\.)?sukebei\.nyaa\.si\/view\/\d+/i],
        fixes: [] // Rich embed only, data fetched via cheerio
    },
    {
        id: PlatformId.NEKOBT,
        name: "NekoBT",
        color: NEKOBT_EMBED_COLOR,
        patterns: [NEKOBT_TORRENT_REGEX],
        fixes: [] // Rich embed only, data fetched via API
    },
    {
        id: PlatformId.AMENZB,
        name: "AmeNZB",
        color: 0x00a2ff,
        patterns: [/https?:\/\/(www\.)?amenzb\.moe\/(release|download)\/\d+/i],
        fixes: [] // Rich embed only
    },
    {
        id: PlatformId.TSUKIHIME,
        name: "Tsukihime",
        color: TSUKIHIME_EMBED_COLOR,
        patterns: [/https?:\/\/(www\.)?tsukihime\.org\/(torrents|view)\/\d+/i],
        fixes: [] // Rich embed only
    }
];
