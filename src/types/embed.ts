/**
 * Embed Types
 * Type definitions for Discord embed building
 */

/** Author information for a post */
export interface PostAuthor {
    name: string;
    username: string;
    avatar?: string;
    url?: string;
}

/** Post engagement statistics */
export interface PostStats {
    likes: number;
    reposts: number;
    comments: number;
}

/** Complete post information for embed building */
export interface PostInfo {
    author: PostAuthor;
    content: string;
    images: string[];
    video?: string;
    videos?: string[];
    stats: PostStats;
    timestamp?: Date;
}
