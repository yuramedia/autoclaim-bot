import { request, gql } from "graphql-request";
import type { AnilistMedia, AnilistResponse } from "../types";
import { ANILIST_API_URL } from "../constants";

export class AnimeMetadataService {
    private static readonly QUERY = gql`
        query ($search: String) {
            Media(search: $search, type: ANIME) {
                id
                idMal
                siteUrl
                title {
                    romaji
                    english
                    native
                }
            }
        }
    `;

    /**
     * Search for anime by title on Anilist
     * returns metadata including MAL ID and Anilist URL
     */
    static async searchAnime(title: string): Promise<AnilistMedia | null> {
        try {
            const data = await request<AnilistResponse>(ANILIST_API_URL, this.QUERY, { search: title });
            return data.Media;
        } catch (error) {
            console.error(`Anilist search failed for "${title}":`, error);
            return null;
        }
    }
}
