/**
 * Parse string stats (like "1.5K", "2M") to number
 */
export function parseStat(str?: string): number {
    if (!str) return 0;
    const clean = str.replace(/[^\d.]/g, "");
    let num = parseFloat(clean);
    if (str.toLowerCase().includes("k")) num *= 1000;
    if (str.toLowerCase().includes("m")) num *= 1000000;
    if (str.toLowerCase().includes("b")) num *= 1000000000;
    return Math.round(num) || 0;
}

/**
 * Formatters using standard ECMAScript Internationalization API (Intl)
 */
const STANDARD_NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
});

/**
 * Format a number with standard thousand separators (e.g. 1,234,567)
 */
export function formatNumber(num: number): string {
    return STANDARD_NUMBER_FORMATTER.format(num);
}

/**
 * Format a number using compact notation (e.g. 1.5K, 2.3M)
 */
export function formatCompactNumber(num: number): string {
    return COMPACT_NUMBER_FORMATTER.format(num);
}
