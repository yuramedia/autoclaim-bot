/**
 * Embed Fix Constants
 * Configuration and detection patterns for social media platforms
 */

import { PlatformId, type PlatformConfig } from "../types/embed-fix";

/** Platform configurations with patterns and fixes */
export const PLATFORMS: PlatformConfig[] = [
    {
        id: PlatformId.TWITTER,
        name: "Twitter/X",
        color: 0x1da1f2,
        patterns: [
            /https?:\/\/(www\.)?(twitter|x)\.com\/\w+\/status\/(\d+)/i,
            /https?:\/\/(www\.)?fxtwitter\.com\/\w+\/status\/(\d+)/i,
            /https?:\/\/(www\.)?fixupx\.com\/\w+\/status\/(\d+)/i
        ],
        fixes: [
            { oldDomain: "twitter.com", newDomain: "fxtwitter.com" },
            { oldDomain: "x.com", newDomain: "fixupx.com" }
        ]
    },
    {
        id: PlatformId.TIKTOK,
        name: "TikTok",
        color: 0x000000,
        patterns: [
            /https?:\/\/(www\.)?tiktok\.com\/@[\w.]+\/video\/\d+/i,
            /https?:\/\/(www\.)?tiktok\.com\/t\/\w+/i,
            /https?:\/\/vm\.tiktok\.com\/\w+/i,
            /https?:\/\/vt\.tiktok\.com\/\w+/i
        ],
        fixes: [{ oldDomain: "tiktok.com", newDomain: "tnktok.com" }]
    },
    {
        id: PlatformId.REDDIT,
        name: "Reddit",
        color: 0xff4500,
        patterns: [
            /https?:\/\/(www\.)?reddit\.com\/r\/\w+\/comments\/\w+/i,
            /https?:\/\/(www\.)?reddit\.com\/r\/\w+\/s\/\w+/i
        ],
        fixes: [{ oldDomain: "reddit.com", newDomain: "vxreddit.com" }]
    },
    {
        id: PlatformId.INSTAGRAM,
        name: "Instagram",
        color: 0xe1306c,
        patterns: [
            /https?:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/[\w-]+/i,
            /https?:\/\/(www\.)?instagram\.com\/share\/(p|reel|reels?)\/[\w-]+/i
        ],
        fixes: [{ oldDomain: "instagram.com", newDomain: "eeinstagram.com" }]
    },
    {
        id: PlatformId.PIXIV,
        name: "Pixiv",
        color: 0x0096fa,
        patterns: [/https?:\/\/(www\.)?pixiv\.net(\/\w+)?\/artworks\/\d+/i],
        fixes: [{ oldDomain: "pixiv.net", newDomain: "phixiv.net" }]
    },
    {
        id: PlatformId.BLUESKY,
        name: "Bluesky",
        color: 0x0085ff,
        patterns: [/https?:\/\/bsky\.app\/profile\/[\w.]+\/post\/\w+/i],
        fixes: [{ oldDomain: "bsky.app", newDomain: "fxbsky.app" }]
    },
    {
        id: PlatformId.THREADS,
        name: "Threads",
        color: 0x000000,
        patterns: [/https?:\/\/(www\.)?threads\.net\/@?\w+\/post\/\w+/i],
        fixes: [{ oldDomain: "threads.net", newDomain: "fixthreads.net" }]
    },
    {
        id: PlatformId.FACEBOOK,
        name: "Facebook",
        color: 0x1877f2,
        patterns: [
            // Supported by Facebed: /:user/posts/:(id|hash)
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/[\w.]+\/posts\/[\w]+/i,
            // Supported: /share/p/:hash (posts) and /share/v/:hash (videos - partial support) and /share/r/:hash (reels)
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/share\/(v|p|r)\/\w+/i,
            // Supported: /groups/:id/posts/:(id|hash)
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/groups\/\d+\/posts\/[\w]+/i,
            // Supported: /permalink.php?story_fbid and /story.php?story_fbid
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/(permalink|story)\.php\?story_fbid/i,
            // Reels (supported)
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/reel\/\d+/i,
            // Videos and watch
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/[\w.]+\/videos\/\d+/i,
            /https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/watch\/?/i,
            // fb.watch short links
            /https?:\/\/(?:www\.)?fb\.watch\/\w+/i
        ],
        fixes: [
            { oldDomain: /(?:[a-z0-9-]+\.)*facebook\.com/i, newDomain: "www.facebed.com" },
            { oldDomain: /(?:www\.)?fb\.watch/i, newDomain: "www.facebed.com" }
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
    }
];
