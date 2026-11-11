import { describe, it, expect } from "bun:test";
import { buildRichEmbed } from "./embed-builder";
import { PlatformId, type PlatformConfig } from "../types/embed-fix";
import type { PostInfo } from "../types/embed";

const mockTwitterPlatform: PlatformConfig = {
    id: PlatformId.TWITTER,
    name: "Twitter/X",
    color: 0x1da1f2,
    patterns: [],
    fixes: []
};

describe("Embed Builder Service", () => {
    describe("buildRichEmbed", () => {
        it("creates a single embed when 1 image is present", () => {
            const info: PostInfo = {
                author: { name: "User", username: "user" },
                content: "Single image post",
                images: ["https://example.com/img1.jpg"],
                stats: { likes: 10, reposts: 5, comments: 2 }
            };

            const embeds = buildRichEmbed(info, mockTwitterPlatform, "https://x.com/user/status/123");
            expect(embeds).toHaveLength(1);

            const data = embeds[0]!.data;
            expect(data.color).toBe(0x1da1f2);
            expect(data.url).toBe("https://x.com/user/status/123");
            expect(data.image?.url).toBe("https://example.com/img1.jpg");
            expect(data.description).toBe("Single image post");
            expect(data.author?.name).toBe("User (@user)");
        });

        it("creates multi-image gallery embeds without color on secondary embeds", () => {
            const info: PostInfo = {
                author: { name: "Photographer", username: "photo" },
                content: "4 photos gallery",
                images: [
                    "https://example.com/img1.jpg",
                    "https://example.com/img2.jpg",
                    "https://example.com/img3.jpg",
                    "https://example.com/img4.jpg"
                ],
                stats: { likes: 100, reposts: 50, comments: 20 }
            };

            const postUrl = "https://x.com/photo/status/999";
            const embeds = buildRichEmbed(info, mockTwitterPlatform, postUrl);
            expect(embeds).toHaveLength(4);

            // Main embed has metadata & color
            expect(embeds[0]!.data.color).toBe(0x1da1f2);
            expect(embeds[0]!.data.url).toBe(postUrl);
            expect(embeds[0]!.data.image?.url).toBe("https://example.com/img1.jpg");
            expect(embeds[0]!.data.description).toBe("4 photos gallery");

            // Secondary embeds must ONLY have url and image for Discord gallery grouping
            for (let i = 1; i < 4; i++) {
                const secondary = embeds[i]!.data;
                expect(secondary.url).toBe(postUrl);
                expect(secondary.image?.url).toBe(`https://example.com/img${i + 1}.jpg`);
                expect(secondary.color).toBeUndefined();
                expect(secondary.author).toBeUndefined();
                expect(secondary.description).toBeUndefined();
                expect(secondary.footer).toBeUndefined();
            }
        });

        it("batches images beyond 4 into grouped gallery URLs up to 10 total", () => {
            const images = Array.from({ length: 8 }, (_, i) => `https://example.com/img${i + 1}.jpg`);
            const info: PostInfo = {
                author: { name: "Gallery Artist", username: "artist" },
                content: "Multi gallery",
                images,
                stats: { likes: 0, reposts: 0, comments: 0 }
            };

            const postUrl = "https://x.com/artist/status/777";
            const embeds = buildRichEmbed(info, mockTwitterPlatform, postUrl);
            expect(embeds).toHaveLength(8);

            // First 4 share postUrl
            for (let i = 0; i < 4; i++) {
                expect(embeds[i]!.data.url).toBe(postUrl);
            }

            // Next 4 share postUrl#2
            for (let i = 4; i < 8; i++) {
                expect(embeds[i]!.data.url).toBe(`${postUrl}#2`);
                expect(embeds[i]!.data.color).toBeUndefined();
            }
        });
    });
});
