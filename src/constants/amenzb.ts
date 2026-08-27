import { config } from "../config";

/**
 * @deprecated ameNZB service and constants are deprecated.
 * Configuration for ameNZB Newznab-compatible Search API
 */

/** ameNZB base URL */
export const AMENZB_BASE_URL = "https://amenzb.moe";

/** ameNZB Newznab API path */
export const AMENZB_API_PATH = "/api";

/** ameNZB release page path prefix */
export const AMENZB_RELEASE_PATH = "/release";

/** ameNZB static screenshots path prefix */
export const AMENZB_SCREENSHOTS_PATH = "/static/screenshots";

/** ameNZB static covers path prefix */
export const AMENZB_COVERS_PATH = "/static/covers";

/** ameNZB API key from environment */
export const AMENZB_API_KEY = config.amenzb.apiKey;
