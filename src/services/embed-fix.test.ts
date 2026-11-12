import { describe, it, expect } from "bun:test";
import { extractUrls, findPlatform, applyFix, extractPostId, processUrls, PlatformId } from "./embed-fix";

describe("Embed Fix Service", () => {
    describe("extractUrls", () => {
        it("extracts plain URLs from message content", () => {
            const content = "Check this out https://twitter.com/jack/status/20 and enjoy!";
            const urls = extractUrls(content);
            expect(urls).toEqual([{ url: "https://twitter.com/jack/status/20", spoilered: false }]);
        });

        it("extracts spoilered URLs with ||", () => {
            const content = "Secret: ||https://x.com/user/status/123456||";
            const urls = extractUrls(content);
            expect(urls).toEqual([{ url: "https://x.com/user/status/123456", spoilered: true }]);
        });

        it("extracts spoilered URLs with spaces inside pipes", () => {
            const content = "Secret: || https://x.com/user/status/123456 ||";
            const urls = extractUrls(content);
            expect(urls).toEqual([{ url: "https://x.com/user/status/123456", spoilered: true }]);
        });

        it("trims trailing punctuation from URLs", () => {
            const content = "Look at this: https://instagram.com/p/Cxyz123., is it cool? (https://redd.it/1abcde)!";
            const urls = extractUrls(content);
            expect(urls).toEqual([
                { url: "https://instagram.com/p/Cxyz123", spoilered: false },
                { url: "https://redd.it/1abcde", spoilered: false }
            ]);
        });

        it("skips URLs wrapped in <> or prefixed with $", () => {
            const content =
                "Ignore <https://twitter.com/test> and $https://x.com/test but keep https://bsky.app/profile/alice.bsky.social/post/123";
            const urls = extractUrls(content);
            expect(urls).toEqual([{ url: "https://bsky.app/profile/alice.bsky.social/post/123", spoilered: false }]);
        });
    });

    describe("findPlatform", () => {
        it("detects Twitter / X URLs including mobile subdomains", () => {
            expect(findPlatform("https://twitter.com/user/status/123")?.id).toBe(PlatformId.TWITTER);
            expect(findPlatform("https://mobile.twitter.com/user/status/123")?.id).toBe(PlatformId.TWITTER);
            expect(findPlatform("https://x.com/user/status/123")?.id).toBe(PlatformId.TWITTER);
            expect(findPlatform("https://mobile.x.com/user/status/123")?.id).toBe(PlatformId.TWITTER);
            expect(findPlatform("https://fxtwitter.com/user/status/123")?.id).toBe(PlatformId.TWITTER);
            expect(findPlatform("https://fixupx.com/user/status/123")?.id).toBe(PlatformId.TWITTER);
            expect(findPlatform("https://vxtwitter.com/user/status/123")?.id).toBe(PlatformId.TWITTER);
        });

        it("detects TikTok video and photo posts, and short links", () => {
            expect(findPlatform("https://www.tiktok.com/@user/video/7123456789012345678")?.id).toBe(PlatformId.TIKTOK);
            expect(findPlatform("https://www.tiktok.com/@user/photo/7123456789012345678")?.id).toBe(PlatformId.TIKTOK);
            expect(findPlatform("https://m.tiktok.com/@user/video/7123456789012345678")?.id).toBe(PlatformId.TIKTOK);
            expect(findPlatform("https://vm.tiktok.com/ZMxxxxxx/")?.id).toBe(PlatformId.TIKTOK);
            expect(findPlatform("https://vt.tiktok.com/ZSxxxxxx/")?.id).toBe(PlatformId.TIKTOK);
            expect(findPlatform("https://tnktok.com/@user/video/7123456789012345678")?.id).toBe(PlatformId.TIKTOK);
        });

        it("detects Reddit posts, old/m subdomains, and redd.it shortlinks", () => {
            expect(findPlatform("https://www.reddit.com/r/gaming/comments/1abcde/test_post/")?.id).toBe(
                PlatformId.REDDIT
            );
            expect(findPlatform("https://old.reddit.com/r/gaming/comments/1abcde/test_post/")?.id).toBe(
                PlatformId.REDDIT
            );
            expect(findPlatform("https://m.reddit.com/r/gaming/comments/1abcde/test_post/")?.id).toBe(
                PlatformId.REDDIT
            );
            expect(findPlatform("https://redd.it/1abcde")?.id).toBe(PlatformId.REDDIT);
            expect(findPlatform("https://reddit.com/r/gaming/s/share123")?.id).toBe(PlatformId.REDDIT);
            expect(findPlatform("https://vxreddit.com/r/gaming/comments/1abcde/test_post/")?.id).toBe(
                PlatformId.REDDIT
            );
        });

        it("detects Instagram posts, reels, tv, share links, and mobile", () => {
            expect(findPlatform("https://www.instagram.com/p/Cxyz123/")?.id).toBe(PlatformId.INSTAGRAM);
            expect(findPlatform("https://instagram.com/reel/Cxyz123/")?.id).toBe(PlatformId.INSTAGRAM);
            expect(findPlatform("https://m.instagram.com/reel/Cxyz123/")?.id).toBe(PlatformId.INSTAGRAM);
            expect(findPlatform("https://www.instagram.com/tv/Cxyz123/")?.id).toBe(PlatformId.INSTAGRAM);
            expect(findPlatform("https://www.instagram.com/share/r/Cxyz123/")?.id).toBe(PlatformId.INSTAGRAM);
            expect(findPlatform("https://eeinstagram.com/p/Cxyz123/")?.id).toBe(PlatformId.INSTAGRAM);
        });

        it("detects Pixiv artworks, mobile, and old query formats", () => {
            expect(findPlatform("https://www.pixiv.net/artworks/12345678")?.id).toBe(PlatformId.PIXIV);
            expect(findPlatform("https://www.pixiv.net/en/artworks/12345678")?.id).toBe(PlatformId.PIXIV);
            expect(findPlatform("https://m.pixiv.net/artworks/12345678")?.id).toBe(PlatformId.PIXIV);
            expect(findPlatform("https://www.pixiv.net/member_illust.php?mode=medium&illust_id=12345678")?.id).toBe(
                PlatformId.PIXIV
            );
            expect(findPlatform("https://phixiv.net/artworks/12345678")?.id).toBe(PlatformId.PIXIV);
        });

        it("detects Bluesky handles with dashes and subdomains", () => {
            expect(findPlatform("https://bsky.app/profile/john-doe.bsky.social/post/3l12345")?.id).toBe(
                PlatformId.BLUESKY
            );
            expect(findPlatform("https://main.bsky.app/profile/alice.bsky.social/post/3l12345")?.id).toBe(
                PlatformId.BLUESKY
            );
            expect(findPlatform("https://fxbsky.app/profile/alice.bsky.social/post/3l12345")?.id).toBe(
                PlatformId.BLUESKY
            );
            expect(findPlatform("https://bsky.app/profile/did:plc:abc123xyz/post/3l12345")?.id).toBe(
                PlatformId.BLUESKY
            );
        });

        it("detects Threads usernames with dots and dashes", () => {
            expect(findPlatform("https://www.threads.net/@john.doe/post/Cu12345")?.id).toBe(PlatformId.THREADS);
            expect(findPlatform("https://threads.net/@user/post/Cu12345")?.id).toBe(PlatformId.THREADS);
            expect(findPlatform("https://fixthreads.net/@user/post/Cu12345")?.id).toBe(PlatformId.THREADS);
        });

        it("detects Facebook posts, reels, and fb.watch", () => {
            expect(findPlatform("https://www.facebook.com/username/posts/123456789")?.id).toBe(PlatformId.FACEBOOK);
            expect(findPlatform("https://www.facebook.com/reel/123456789")?.id).toBe(PlatformId.FACEBOOK);
            expect(findPlatform("https://fb.watch/xyz123/")?.id).toBe(PlatformId.FACEBOOK);
            expect(findPlatform("https://www.facebed.com/reel/123456789")?.id).toBe(PlatformId.FACEBOOK);
        });

        it("returns null for non-supported URLs", () => {
            expect(findPlatform("https://google.com")).toBeNull();
            expect(findPlatform("https://github.com/microsoft/vscode")).toBeNull();
        });
    });

    describe("applyFix", () => {
        it("fixes Twitter and X URLs to fxtwitter / fixupx", () => {
            const tw = findPlatform("https://twitter.com/jack/status/20")!;
            expect(applyFix("https://twitter.com/jack/status/20", tw)).toBe("https://fxtwitter.com/jack/status/20");

            const mobTw = findPlatform("https://mobile.twitter.com/jack/status/20")!;
            expect(applyFix("https://mobile.twitter.com/jack/status/20", mobTw)).toBe(
                "https://fxtwitter.com/jack/status/20"
            );

            const x = findPlatform("https://x.com/jack/status/20")!;
            expect(applyFix("https://x.com/jack/status/20", x)).toBe("https://fixupx.com/jack/status/20");
        });

        it("does NOT double-prefix already-fixed Twitter URLs", () => {
            const fx = findPlatform("https://fxtwitter.com/jack/status/20")!;
            expect(applyFix("https://fxtwitter.com/jack/status/20", fx)).toBe("https://fxtwitter.com/jack/status/20");

            const fixupx = findPlatform("https://fixupx.com/jack/status/20")!;
            expect(applyFix("https://fixupx.com/jack/status/20", fixupx)).toBe("https://fixupx.com/jack/status/20");
        });

        it("fixes TikTok URLs to tnktok", () => {
            const tt = findPlatform("https://www.tiktok.com/@user/video/123")!;
            expect(applyFix("https://www.tiktok.com/@user/video/123", tt)).toBe("https://tnktok.com/@user/video/123");

            const vm = findPlatform("https://vm.tiktok.com/ZM123")!;
            expect(applyFix("https://vm.tiktok.com/ZM123", vm)).toBe("https://vm.tnktok.com/ZM123");
        });

        it("does NOT double-prefix already-fixed TikTok URLs", () => {
            const tnk = findPlatform("https://tnktok.com/@user/video/123")!;
            expect(applyFix("https://tnktok.com/@user/video/123", tnk)).toBe("https://tnktok.com/@user/video/123");
        });

        it("fixes Reddit URLs to vxreddit / rxddit", () => {
            const r = findPlatform("https://www.reddit.com/r/test/comments/123/title")!;
            expect(applyFix("https://www.reddit.com/r/test/comments/123/title", r)).toBe(
                "https://vxreddit.com/r/test/comments/123/title"
            );

            const oldR = findPlatform("https://old.reddit.com/r/test/comments/123/title")!;
            expect(applyFix("https://old.reddit.com/r/test/comments/123/title", oldR)).toBe(
                "https://vxreddit.com/r/test/comments/123/title"
            );

            const reddIt = findPlatform("https://redd.it/123")!;
            expect(applyFix("https://redd.it/123", reddIt)).toBe("https://rxddit.com/123");
        });

        it("does NOT double-prefix already-fixed Reddit URLs", () => {
            const vx = findPlatform("https://vxreddit.com/r/test/comments/123/title")!;
            expect(applyFix("https://vxreddit.com/r/test/comments/123/title", vx)).toBe(
                "https://vxreddit.com/r/test/comments/123/title"
            );
        });

        it("fixes Instagram URLs to eeinstagram", () => {
            const ig = findPlatform("https://www.instagram.com/p/Cxyz123/")!;
            expect(applyFix("https://www.instagram.com/p/Cxyz123/", ig)).toBe("https://eeinstagram.com/p/Cxyz123/");

            const mIg = findPlatform("https://m.instagram.com/reel/Cxyz123/")!;
            expect(applyFix("https://m.instagram.com/reel/Cxyz123/", mIg)).toBe(
                "https://eeinstagram.com/reel/Cxyz123/"
            );
        });

        it("does NOT double-prefix already-fixed Instagram URLs", () => {
            const ee = findPlatform("https://eeinstagram.com/p/Cxyz123/")!;
            expect(applyFix("https://eeinstagram.com/p/Cxyz123/", ee)).toBe("https://eeinstagram.com/p/Cxyz123/");
        });

        it("fixes Pixiv, Bluesky, Threads, and Facebook correctly", () => {
            const pixiv = findPlatform("https://m.pixiv.net/artworks/123456")!;
            expect(applyFix("https://m.pixiv.net/artworks/123456", pixiv)).toBe("https://phixiv.net/artworks/123456");

            const bsky = findPlatform("https://bsky.app/profile/john-doe.bsky.social/post/3l123")!;
            expect(applyFix("https://bsky.app/profile/john-doe.bsky.social/post/3l123", bsky)).toBe(
                "https://fxbsky.app/profile/john-doe.bsky.social/post/3l123"
            );

            const threads = findPlatform("https://www.threads.net/@john.doe/post/Cu12345")!;
            expect(applyFix("https://www.threads.net/@john.doe/post/Cu12345", threads)).toBe(
                "https://fixthreads.net/@john.doe/post/Cu12345"
            );

            const fb = findPlatform("https://www.facebook.com/reel/123456")!;
            expect(applyFix("https://www.facebook.com/reel/123456", fb)).toBe("https://www.facebed.com/reel/123456");

            const fbWatch = findPlatform("https://fb.watch/xyz123/")!;
            expect(applyFix("https://fb.watch/xyz123/", fbWatch)).toBe("https://www.facebed.com/xyz123/");
        });
    });

    describe("extractPostId", () => {
        it("extracts IDs across various platforms", () => {
            const tw = findPlatform("https://twitter.com/jack/status/20")!;
            expect(extractPostId("https://twitter.com/jack/status/20", tw)).toBe("20");

            const bsky = findPlatform("https://bsky.app/profile/user/post/3l456")!;
            expect(extractPostId("https://bsky.app/profile/user/post/3l456", bsky)).toBe("3l456");

            const pixiv = findPlatform("https://www.pixiv.net/artworks/99887766")!;
            expect(extractPostId("https://www.pixiv.net/artworks/99887766", pixiv)).toBe("99887766");

            const ttVideo = findPlatform("https://www.tiktok.com/@user/video/711223344")!;
            expect(extractPostId("https://www.tiktok.com/@user/video/711223344", ttVideo)).toBe("711223344");

            const ttPhoto = findPlatform("https://www.tiktok.com/@user/photo/799887766")!;
            expect(extractPostId("https://www.tiktok.com/@user/photo/799887766", ttPhoto)).toBe("799887766");

            const reddit = findPlatform("https://www.reddit.com/r/test/comments/abc123/title")!;
            expect(extractPostId("https://www.reddit.com/r/test/comments/abc123/title", reddit)).toBe("abc123");

            const reddIt = findPlatform("https://redd.it/xyz789")!;
            expect(extractPostId("https://redd.it/xyz789", reddIt)).toBe("xyz789");

            const ig = findPlatform("https://www.instagram.com/reel/Cu98765/")!;
            expect(extractPostId("https://www.instagram.com/reel/Cu98765/", ig)).toBe("Cu98765");

            const threads = findPlatform("https://www.threads.net/@user/post/D98765")!;
            expect(extractPostId("https://www.threads.net/@user/post/D98765", threads)).toBe("D98765");
        });
    });

    describe("processUrls", () => {
        it("processes message URLs and filters disabled platforms", () => {
            const content = "Links: https://twitter.com/a/status/1 and https://instagram.com/p/2";
            const processed = processUrls(content, [PlatformId.INSTAGRAM]);

            expect(processed).toHaveLength(1);
            expect(processed[0]?.platform.id).toBe(PlatformId.TWITTER);
            expect(processed[0]?.fixedUrl).toBe("https://fxtwitter.com/a/status/1");
        });

        it("preserves spoilered status", () => {
            const content = "Secret ||https://x.com/a/status/1||";
            const processed = processUrls(content);

            expect(processed).toHaveLength(1);
            expect(processed[0]?.spoilered).toBe(true);
            expect(processed[0]?.fixedUrl).toBe("https://fixupx.com/a/status/1");
        });
    });
});
