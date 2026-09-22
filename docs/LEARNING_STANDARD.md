# Understand, explain, and apply

Status: learning design standard for every module. Make a hard idea easy to grasp without hiding the assumptions that make the explanation true. A learner should leave able to explain it to a teammate and answer an interview follow-up in their own words.

## The learning ladder

Each module follows six short stages:

1. **One-sentence idea:** What problem does this concept solve? Use familiar words first.
2. **Small example:** Follow one request or operation, with actual values when helpful.
3. **Mechanism:** Show what changes in order. Name technical terms after the idea is clear.
4. **Experiment:** Ask for a prediction, change an input, and inspect the result.
5. **Tradeoff and failure:** Show when the approach helps, what it costs, and one way it breaks.
6. **Teach it back:** Explain the idea, evidence, and choice to a teammate or interviewer.

The learner can jump to a stage, but the default path follows this order. “More depth” reveals implementation details, advanced constraints, and papers after the core example. Keep the first screen focused on the central question and next action.

## Two explanation modes

**Explain to a teammate:** “A teammate is about to change this system. Explain how it works, what can go wrong, and what evidence you would check.” A useful answer has the situation, mechanism, observed consequence, and next engineering decision.

**Explain in an interview:** State assumptions, propose a simple viable design, trace a read and write, identify the likely bottleneck, and defend a tradeoff. A concept answer should fit roughly two minutes. A case study expands into a full design session. The structure guides reasoning rather than supplying a script to memorize.

Allow free-text notes and a prompt to speak aloud. Reveal a model explanation after an attempt. The learner self-checks for **clear problem, accurate mechanism, assumptions, evidence/numbers, tradeoff, and a failure or follow-up**. The app does not pretend to automatically grade nuanced free-text reasoning.

The **attempt → reveal → compare → revise** interaction is drawn from LLD with UI. Show the learner's original explanation beside the reference and keep it editable. Make “show reference now” available for someone who wants to learn by reading; record an attempt only when one was made. Do not block access to factual concepts behind a mandatory quiz.

Follow-up cards change one condition, such as more traffic, stale reads, node loss, skew, or stricter correctness. A good answer updates the design when the condition changes.

## Writing rules

- Lead with a real question and a plain-language answer. Define each new term at first use.
- Use one small consistent example across prose, diagram, trace, and practice.
- State cause and effect explicitly: “B is busy, so request 4 waits in B's queue.”
- Put conditions on claims: “In this workload, policy A finishes request 4 sooner.”
- Use numbers with units and visible arithmetic. Label assumptions, modeled results, and production measurements.
- Present a simple first design, then add complexity when a concrete pressure calls for it.
- Include a tempting wrong explanation and correct it with evidence from the example.
- End with a short adaptable explanation, two likely follow-ups, and an application to an everyday project.
- Avoid unexplained acronyms, product lists, and encyclopedic paragraphs in the first layer.
- Simplification may omit details, but it must not teach a false guarantee; state the boundary nearby.

## Example: request flow

**Simple idea:** A load balancer chooses a service node, but a request waits when that node's workers are busy.

**Example:** Six requests arrive together. Two nodes can handle one request each, and each request takes 100 ms. Two finish after 100 ms, two after 200 ms, and two after 300 ms.

**Why:** Requests 5 and 6 spend 200 ms waiting and 100 ms in service. Their 300 ms latency does not mean the service code took 300 ms.

**Tradeoff:** A queue absorbs a short burst; sustained overload keeps latency rising or eventually rejects work. Routing alone does not create worker capacity.

**Explain to a teammate:** “Queue time grew while service time stayed fixed. Let's inspect per-node queue depth and worker utilization before changing application code or adding capacity.”

**Interview follow-up:** “What if one node is four times slower?” Use the slow-node fixture to compare routing policies, then discuss health checks and what the model omits.

## Example: cache-aside

**Simple idea:** A cache keeps a nearby copy so repeated reads avoid the origin, but the copy may lag behind a change.

**Example:** The first read of `k` fetches version 1. The origin later changes to version 2, but a cache hit can still return version 1 until expiry or invalidation.

**Tradeoff:** A longer TTL may remove more origin reads while widening the stale-data window. Invalidation can improve freshness but adds ordering and failure cases.

**Explain to a teammate:** “The origin is at version 2; the cache still holds version 1. We need to choose the freshness requirement and inspect both stale responses and origin load.”

**Interview follow-up:** “What happens when many requests miss together?” Under the first model, each cold miss can reach the origin because coalescing is absent.

## Publication check

Every topic and case study needs a 30–60 second plain-language opening, one example carried through the module, a prediction with an evidence-backed answer, a teammate explanation prompt, a two-minute interview scaffold, two changed-condition follow-ups, one wrong explanation with its correction, and a self-check rubric linked to the relevant events or text. Case studies also need a short opening pitch and a deeper interview walkthrough.

Review with someone new to the topic. Ask them to explain the idea without reading the screen. If they can only repeat terms or diagram labels, revise the example and explanation before publishing.
