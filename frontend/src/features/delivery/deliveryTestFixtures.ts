import {
  baselineInput,
  baselineResult,
  descriptor as canonicalDescriptor,
} from "../../api/deliveryTestFixtures";
import type { DeliveryDescriptor } from "../../api/types";
export { baselineInput, baselineResult };
// UI selector fixtures reuse the canonical Java-reconciled baseline and descriptor limits.
export const descriptor: DeliveryDescriptor = {
  ...canonicalDescriptor,
  presets: [
    { ...canonicalDescriptor.presets[0]!, title: "Baseline" },
    {
      id: "lost-ack",
      title: "Lose the first ACK",
      question: "Can the same message commit twice?",
      input: {
        ...baselineInput,
        lostAcknowledgments: [{ messageId: "m1", attempt: 1 }],
      },
    },
  ],
};
