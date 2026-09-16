import { describe, it, expect } from "bun:test";
import { User } from "./user";

describe("User Model", () => {
    describe("Schema & Indexes", () => {
        it("has correct model name and schema fields", () => {
            expect(User.modelName).toBe("User");
            const paths = User.schema.paths;
            expect(paths.discordId).toBeDefined();
            expect(paths.username).toBeDefined();
            expect(paths.hoyolab).toBeDefined();
            expect(paths.endfield).toBeDefined();
            expect(paths["settings.notifyOnClaim"]).toBeDefined();
        });

        it("defines sparse compound index on hoyolab.token and hoyolab.lastClaim", () => {
            const indexes = User.schema.indexes();
            const hoyolabIndex = indexes.find(
                ([fields, options]) =>
                    fields["hoyolab.token"] === 1 && fields["hoyolab.lastClaim"] === 1 && options?.sparse === true
            );
            expect(hoyolabIndex).toBeDefined();
        });

        it("defines sparse compound index on endfield.accountToken and endfield.lastClaim", () => {
            const indexes = User.schema.indexes();
            const endfieldIndex = indexes.find(
                ([fields, options]) =>
                    fields["endfield.accountToken"] === 1 &&
                    fields["endfield.lastClaim"] === 1 &&
                    options?.sparse === true
            );
            expect(endfieldIndex).toBeDefined();
        });

        it("defines an index on settings.notifyOnClaim", () => {
            const indexes = User.schema.indexes();
            const settingsIndex = indexes.find(([fields]) => fields["settings.notifyOnClaim"] === 1);
            expect(settingsIndex).toBeDefined();
        });

        it("disables _id on embedded hoyolab and endfield subschemas", () => {
            const doc = new User({
                discordId: "123456789",
                username: "TestUser",
                hoyolab: {
                    token: "test_token",
                    accountName: "Traveler",
                    games: {
                        genshin: true,
                        starRail: false,
                        honkai3: false,
                        tearsOfThemis: false,
                        zenlessZoneZero: false
                    }
                },
                endfield: {
                    accountToken: "test_endfield_token",
                    accountName: "Doctor"
                }
            });

            // Subdocuments should not have auto-generated _id
            const hoyolabRaw = doc.hoyolab as unknown as Record<string, unknown>;
            const endfieldRaw = doc.endfield as unknown as Record<string, unknown>;
            expect(hoyolabRaw?.["_id"]).toBeUndefined();
            expect(endfieldRaw?.["_id"]).toBeUndefined();
        });
    });
});
