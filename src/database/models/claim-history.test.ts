import { describe, it, expect } from "bun:test";
import { ClaimHistory } from "./claim-history";

describe("ClaimHistory Model", () => {
    describe("Schema & Indexes", () => {
        it("has correct collection name and schema fields", () => {
            expect(ClaimHistory.modelName).toBe("ClaimHistory");
            const paths = ClaimHistory.schema.paths;
            expect(paths.discordId).toBeDefined();
            expect(paths.service).toBeDefined();
            expect(paths.game).toBeDefined();
            expect(paths.success).toBeDefined();
            expect(paths.message).toBeDefined();
            expect(paths.rewards).toBeDefined();
            expect(paths.claimedAt).toBeDefined();
        });

        it("defines a compound index on discordId and claimedAt (-1)", () => {
            const indexes = ClaimHistory.schema.indexes();
            const compoundIndex = indexes.find(([fields]) => fields.discordId === 1 && fields.claimedAt === -1);
            expect(compoundIndex).toBeDefined();
        });

        it("defines a 30-day TTL index on claimedAt", () => {
            const indexes = ClaimHistory.schema.indexes();
            const ttlIndex = indexes.find(
                ([fields, options]) => fields.claimedAt === 1 && options?.expireAfterSeconds === 30 * 24 * 60 * 60
            );
            expect(ttlIndex).toBeDefined();
        });
    });
});
