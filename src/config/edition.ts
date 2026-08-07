/**
 * Product edition gate.
 * Product (Forgejo) builds stay `"product"` — no Liani / cute simple-mode code paths.
 * OSS public builds set `"oss"` on the oss/public branch only.
 */
export type Edition = "product" | "oss";

/** Product builds: "product". OSS publish branch rewrites this to "oss". */
export const EDITION = "product" as Edition;

export const isOssEdition: boolean = EDITION === "oss";
