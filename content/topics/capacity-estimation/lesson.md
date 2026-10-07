# Capacity Estimation

Before choosing servers or a database, ask how much work the product creates. This module turns a few stated assumptions into numbers you can explain, challenge, and test.

## Learning outcomes

After this module, you can turn product assumptions into a defensible range for traffic, storage, bandwidth, and concurrent work. You can also explain what those estimates leave out before choosing architecture components.

## Explain it simply

Capacity estimation is a chain of unit conversions. Start with people and actions per day. Convert them into requests per second, then use the read/write split, payload size, retention, latency, and a peak factor to expose the pressures your design must handle.

The answer is a planning range. It helps you ask better questions; it is not a benchmark or an instance recommendation.

## Prerequisites

Complete **Request Flow & Load Balancing** first. You should know that finite workers and queues affect latency and that a load balancer cannot create service capacity.

## Mental model

Think of the estimate as a funnel:

1. **Usage** creates daily requests.
2. **Time and traffic shape** turn daily requests into average and peak rates.
3. **Read/write mix** separates serving pressure from new data.
4. **Payload and retention** turn operations into bandwidth and storage.
5. **Latency** turns a rate into mean work in flight.

Keep units beside every number. A correct formula with mixed units still gives a wrong design input.

## How it works

Daily requests are `daily active users × requests per user per day`. Divide by 86,400 seconds to get average requests per second. Multiply by a stated peak factor for the modeled busy period.

Writes per day are `daily requests × write fraction`. Raw retained storage in GB is `writes/day × kB/write × retention days ÷ 1,000,000`. The division converts decimal kB to GB. Replication multiplies the raw data copies, while indexes, logs, backups, and operational headroom remain separate concerns.

Peak response bandwidth in Mb/s is `requests/s × kB/response × 8 ÷ 1,000`. Multiply by 1,000 to turn kB into bytes and by 8 for bits, then divide by 1,000,000 for megabits. The calculator uses decimal units: 1 kB is 1,000 bytes and 1 GB is 1,000,000,000 bytes.

Mean concurrent requests are estimated with `peak requests/s × mean latency ms ÷ 1,000`. Here latency means the total time a request spends in the system, including queueing. Treat the assumed peak period as a stable workload; the result is a mean, not a worker count, CPU count, or burst guarantee. [Little's original theorem](https://pubsonline.informs.org/doi/10.1287/opre.9.3.383) relates finite averages under explicit stationary-process conditions. Using one assumed peak rate and latency is this calculator's approximation, not proof those conditions hold in production.

## Worked example

Assume 1 million daily users, 10 requests per user per day, a 5× peak factor, 90% reads, 1 kB per new record, 2 kB responses, 365 days of retention, three data copies, 200 ms mean latency, and 30% planning headroom.

- Daily requests: 10,000,000.
- Average rate: about 115.74 requests/s.
- Peak rate: about 578.70 requests/s, split into 520.83 reads/s and 57.87 writes/s.
- Raw retained data: 365 GB; three copies: 1,095 GB.
- Peak response bandwidth: about 9.26 Mb/s.
- Mean peak concurrency: `578.70 requests/s × 200 ms ÷ 1,000`, about 115.74 requests.
- Target peak with 30% headroom: `578.70 × 1.30`, about 752.31 requests/s. This is a planning target, not a measured limit.

Round only for presentation. Keep full precision through the calculation so small errors do not compound.

## Explore in the playground

Start with **Interview baseline** and predict an output before selecting **Calculate estimate**. Double only the peak factor: peak request rate, bandwidth, and concurrency should double, while daily storage stays fixed. Then reduce the read percentage and observe why write volume and storage rise.

Use the low/base/high range to explore a traffic assumption at 80%, 100%, and 120% of the submitted peak rate. These are what-if scenarios, not statistical confidence intervals. The range excludes the separate headroom margin and holds response size and mean latency fixed. With the baseline, it shows about 462.96, 578.70, and 694.44 requests/s. Open the calculation trail to check each formula and unit.

Try two changed conditions:

1. **Reads increase from 90% to 99%.** Predict storage first. Writes fall from 1,000,000 to 100,000 per day, so raw retained data falls from 365 to 36.5 GB and three copies need 109.5 GB. Peak traffic and response bandwidth stay fixed because total requests and response size did not change.
2. **Mean latency increases from 200 to 400 ms.** Mean in-flight work doubles to about 231.48 requests. Traffic and storage stay fixed. This does not tell you whether the extra time came from CPU work, queues, or waiting on a dependency.

## Failures and tradeoffs

The largest error often comes from a weak assumption rather than arithmetic. A daily average hides traffic shape. A single mean response size hides endpoints with very different payloads. A replication factor omits indexes, write amplification, backups, and temporary data during maintenance.

Adding headroom can make a target more cautious, but it cannot repair an unrealistic workload model. In this calculator it raises the target request rate only; it does not multiply storage, bandwidth, or mean concurrency. Estimate those separately for a target-load test if needed.

A tempting wrong explanation is: “The calculator says 116 requests in flight, so I need 116 workers and can accept a burst of 500.” The 116 is an average of unfinished requests. Waiting on I/O can occupy an in-flight slot while using little CPU; queueing also contributes to total latency. [Google SRE's discussion of active-request counts](https://sre.google/sre-book/load-balancing-datacenter/) explains why those counts alone can misrepresent backend capability. Use the Request Flow module to inspect a burst and its rejection/queue behavior.

## In a real project

Write every assumption with an owner and evidence source. Use observed percentiles for traffic and payloads when possible. Calculate more than one scenario, identify which input moves the answer most, and revisit the sheet when product behavior changes.

[AWS load-testing guidance](https://docs.aws.amazon.com/wellarchitected/latest/framework/perf_process_culture_load_test.html) recommends realistic workloads and explicit performance objectives. Test the whole request path, observe throughput, rejection, and latency percentiles, and revise the assumptions from the evidence.

Map each result to a design question: peak RPS informs service and dependency testing, writes per second inform ingestion, retained bytes inform storage layout, bandwidth informs network paths, and concurrency informs worker and connection limits.

## Interview practice

Say the assumptions before the arithmetic. Work in round numbers, carry units aloud, and explain why you chose each factor. Finish with the missing factors you would validate in a real system.

If mean peak concurrency is about 116 but 500 requests arrive together, explain that the mean relationship hides burst shape, queue capacity, worker limits, service time distribution, and dependency limits. Connect that answer back to the Request Flow playground.

## Teach it back

**To a teammate:** “At the assumed busy-period rate, we expect about 579 requests/s and 116 requests in flight if mean total latency stays at 200 ms. We retain about 1,095 GB of raw copies. The 752 requests/s target includes 30% headroom, but we still need tests of the request path and separate storage overhead estimates. Let's validate traffic shape and latency before choosing workers or instances.”

**Two-minute interview scaffold:**

1. State daily usage, traffic shape, read/write mix, sizes, retention, and latency assumptions.
2. Derive average and peak rates with units; give the storage and bandwidth conversions.
3. Use rate × mean total latency for average in-flight work, then explain why this does not size workers.
4. State the target and uncertainty: headroom and traffic scenarios are explicit assumptions.
5. Identify the largest missing factor and describe the load test or measurement that would change the design.

**Self-check:** Can you explain why peak factor changes traffic but not daily storage, why more reads reduce new records under this model, where kB becomes GB or Mb/s, and what evidence is needed before promising burst capacity? Use the calculation trail as evidence, then explain it aloud without reading the formulas.

## Further reading

- John D. C. Little's original paper establishes the long-run relationship between average items in a system, arrival rate, and average time in the system.
- Google SRE's chapter on load balancing discusses load, capacity, and the limits of simplified resource models.
- [AWS PERF05-BP04](https://docs.aws.amazon.com/wellarchitected/latest/framework/perf_process_culture_load_test.html) explains how to test expected and larger workloads with defined objectives.
- [Google SRE, Load Balancing in the Datacenter](https://sre.google/sre-book/load-balancing-datacenter/) discusses why active requests and CPU capacity can diverge.
