/**
 * Product edition gate.
 * Product (Forgejo) builds stay `"product"` — no Liani / cute simple-mode code paths.
 * OSS public builds set `"oss"` on the oss/public branch only.
 */
export type Edition = "product" | "oss";

export const EDITION: Edition = "product";

export const isOssEdition = EDITION === "oss";
