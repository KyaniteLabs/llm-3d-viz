import { isOssEdition } from "./config/edition";
import { OBSERVATORY_URL_KEYS } from "./lib/observatory-url";

const params = new URLSearchParams(window.location.search);
const showObservatory = !isOssEdition || params.get("view") === "observatory" ||
  OBSERVATORY_URL_KEYS.some((key) => params.has(key));

const loadView = showObservatory
  ? import("./main").then(({ startObservatory }) => startObservatory())
  : import("./ui/public-decision").then(({ mountPublicDecision }) => mountPublicDecision());

void loadView.catch((error) => {
  console.error("[entry] view failed to load", error);
  document.querySelector<HTMLElement>("#app-shell")!.hidden = true;
  const fallback = document.querySelector<HTMLElement>("#app-load-error")!;
  fallback.querySelector("button")!.addEventListener("click", () => window.location.reload());
  fallback.hidden = false;
});
