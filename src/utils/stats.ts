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
