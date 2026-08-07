/**
 * Product edition gate.
 * Product (Forgejo) builds stay `"product"` — no Liani / cute simple-mode code paths.
 * OSS public builds set `"oss"` on the oss/public branch only.
 */
export type Edition = "product" | "oss";

/** OSS publish branch. Product main keeps "product". */
export const EDITION = "oss" as Edition;

export const isOssEdition: boolean = EDITION === "oss";
