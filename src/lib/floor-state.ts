/**
 * Decide-mode floor provenance — the one place that names its lifecycle.
 *
 * Three AppState fields together encode ONE stage, so they are only ever
 * written as a unit through the transitions below:
 *
 *   stage     floorSource  floorUserSet  floorAnchorModelId
 *   default   "default"    false         null
 *   user      "user"       true          null
 *   anchor    "anchor"     true          <model id>
 *
 * Legal transitions (the floor number itself is carried separately):
 *
 *            setFloorByUser            setFloorByAnchor(id)
 *   default ───────────────▶ user ◀──────────────────────▶ anchor
 *      │                    (slider / clear anchor)          ▲
 *      └─────────────────────────────────────────────────────┘
 *                         setFloorByAnchor(id)
 *
 *   enterDecideDefault: default → default (first Decide entry applies the
 *   fork default floor). Once a user/anchor floor exists the session never
 *   silently falls back to "default" — re-entering Decide keeps it.
 *   Whole-state restore (undo, URL share) goes through `assertFloorProvenance`.
 */
import type { FloorSource } from "./decide";

export const FLOOR_SOURCES = ["default", "user", "anchor"] as const satisfies readonly FloorSource[];

export interface FloorProvenance {
  floorSource: FloorSource;
  floorUserSet: boolean;
  floorAnchorModelId: string | null;
}

export class IllegalFloorTransition extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalFloorTransition";
  }
}

export function isFloorSource(v: unknown): v is FloorSource {
  return typeof v === "string" && (FLOOR_SOURCES as readonly string[]).includes(v);
}

/** The single invariant: the three fields agree on one stage. */
export function isLegalFloorProvenance(p: FloorProvenance): boolean {
  switch (p.floorSource) {
    case "default":
      return p.floorUserSet === false && p.floorAnchorModelId === null;
    case "user":
      return p.floorUserSet === true && p.floorAnchorModelId === null;
    case "anchor":
      return p.floorUserSet === true && typeof p.floorAnchorModelId === "string" && p.floorAnchorModelId.trim().length > 0;
    default:
      return false;
  }
}

export function assertFloorProvenance(p: FloorProvenance): FloorProvenance {
  if (!isLegalFloorProvenance(p)) {
    throw new IllegalFloorTransition(
      `illegal floor provenance: source=${String(p.floorSource)} userSet=${String(p.floorUserSet)} anchor=${String(p.floorAnchorModelId)}`,
    );
  }
  return p;
}

/** Initial stage (no floor chosen this session). */
export function defaultFloorProvenance(): FloorProvenance {
  return { floorSource: "default", floorUserSet: false, floorAnchorModelId: null };
}

/** Any stage → user (slider moved, anchor cleared, URL `floor=` without anchor). */
export function setFloorByUser(): FloorProvenance {
  return { floorSource: "user", floorUserSet: true, floorAnchorModelId: null };
}

/** Any stage → anchor. Refuses an empty id (would be an anchor with no model). */
export function setFloorByAnchor(id: string): FloorProvenance {
  if (typeof id !== "string" || !id.trim()) {
    throw new IllegalFloorTransition("setFloorByAnchor requires a non-empty model id");
  }
  return { floorSource: "anchor", floorUserSet: true, floorAnchorModelId: id };
}

/**
 * First Decide entry: default → default. Refused from user/anchor (that would
 * drop the user's floor). Callers check `current.floorSource === "default"`.
 */
export function enterDecideDefault(current: FloorProvenance): FloorProvenance {
  if (current.floorSource !== "default") {
    throw new IllegalFloorTransition(`enterDecideDefault refused from "${current.floorSource}"`);
  }
  return defaultFloorProvenance();
}

/**
 * Tolerant reader for values from outside the typed store (agent context,
 * older snapshots). Never throws; maps anything unknown onto a legal stage.
 */
export function readFloorProvenance(raw: {
  floorSource?: unknown;
  floorUserSet?: unknown;
  floorAnchorModelId?: unknown;
}): FloorProvenance {
  const id = typeof raw.floorAnchorModelId === "string" ? raw.floorAnchorModelId.trim() : "";
  if (raw.floorSource === "anchor" || (!isFloorSource(raw.floorSource) && id)) {
    return id ? setFloorByAnchor(id) : setFloorByUser();
  }
  if (raw.floorSource === "user") return setFloorByUser();
  if (raw.floorSource === "default") return defaultFloorProvenance();
  return raw.floorUserSet === true ? setFloorByUser() : defaultFloorProvenance();
}

/** Pick the provenance triple out of a larger state object. */
export function floorProvenanceOf(s: FloorProvenance): FloorProvenance {
  return {
    floorSource: s.floorSource,
    floorUserSet: s.floorUserSet,
    floorAnchorModelId: s.floorAnchorModelId,
  };
}
