import type { CacheAsideInput, CacheAsideResult } from "../../../api/types";
import baselineJson from "./baseline.json";
import coldBurstJson from "./cold-burst.json";
import limitedJson from "./limited.json";
import multiKeyJson from "./multi-key.json";

// Responses captured from the packaged Java backend (model 1.0.1) for the
// submitted input. Recapture them if the model version changes.
export type CacheFixture = { input: CacheAsideInput; result: CacheAsideResult };

const fixture = (json: unknown) => json as CacheFixture;

export const baseline = fixture(baselineJson);
export const coldBurst = fixture(coldBurstJson);
/** GET a, GET k, UPDATE a (new key), then a hit for each key. */
export const multiKey = fixture(multiKeyJson);
/** The second GET arrives at 60,000 ms and stops at the virtual-time limit. */
export const limited = fixture(limitedJson);
