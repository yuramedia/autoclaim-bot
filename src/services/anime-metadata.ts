import { request, gql } from "graphql-request";
import type { AnilistMedia, AnilistResponse } from "../types";
import { ANILIST_API_URL } from "../constants";

const QUERY = gql`
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
 * @returns metadata including MAL ID and Anilist URL
 */
export async function searchAnime(title: string): Promise<AnilistMedia | null> {
    try {
        const data = await request<AnilistResponse>(ANILIST_API_URL, QUERY, { search: title });
        return data.Media;
    } catch (error) {
        console.error(`Anilist search failed for "${title}":`, error);
        return null;
    }
}

/** @deprecated Use searchAnime() directly */
export const AnimeMetadataService = { searchAnime };
