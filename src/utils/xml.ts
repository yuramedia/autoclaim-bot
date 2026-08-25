/**
 * XML Utility
 * Shared helpers over Bun's native XML parser (Bun.XML), giving feed services
 * a loose node type and normalization of repeated elements.
 */

/** Any value a parsed element can hold for a given key. */
export type XmlNodeValue = string | XmlNode | XmlNode[];

/**
 * Loose shape of a parsed XML element (Bun.XML compact shape):
 * - attribute values under `"@name"` keys
 * - character data under `"#text"`
 * - child elements under their tag names (arrays when the name repeats)
 */
export interface XmlNode {
    [key: string]: XmlNodeValue | undefined;
}

/**
 * Parse an XML 1.0 document with Bun's native parser.
 * Throws a SyntaxError on malformed input — callers are expected to catch.
 *
 * @param xml - Raw XML text.
 * @returns Parsed document in the compact shape, keyed by the root element name.
 */
export function parseXml(xml: string): XmlNode {
    return Bun.XML.parse(xml) as unknown as XmlNode;
}

/**
 * Normalize a child node that may be a single element, an array of elements
 * (repeated tags), or missing, into an array. Text leaves yield an empty
 * array since they cannot contain child elements.
 *
 * @param node - Child node value from a parsed {@link XmlNode}.
 * @returns Always an array (empty when the node is missing or a text leaf).
 */
export function xmlNodeArray(node: XmlNodeValue | undefined): XmlNode[] {
    if (node === undefined || node === null || typeof node === "string") return [];
    return Array.isArray(node) ? node : [node];
}

/**
 * Extract an element's character data from a value that may be a text leaf,
 * an element holding `"#text"`, or missing.
 *
 * @param node - Node value from a parsed {@link XmlNode}.
 * @returns The text content, or an empty string when there is none.
 */
export function xmlText(node: XmlNodeValue | undefined): string {
    if (typeof node === "string") return node;
    if (node === undefined || node === null || Array.isArray(node)) return "";
    return String(node["#text"] || "");
}

/**
 * Extract a string attribute value from a parsed element.
 *
 * @param node - Parsed element (or missing).
 * @param name - Attribute name without the `"@"` prefix.
 * @returns The attribute value, or null when absent.
 */
export function xmlAttr(node: XmlNode | undefined, name: string): string | null {
    const value = node?.[`@${name}`];
    return typeof value === "string" && value ? value : null;
}
