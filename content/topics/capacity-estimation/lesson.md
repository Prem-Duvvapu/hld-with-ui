# Capacity Estimation

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

Writes per day are `daily requests × write fraction`. Raw retained storage is `writes per day × record size × retention days`. Replication multiplies the raw data copies, while indexes, logs, backups, and operational headroom remain separate concerns.

Peak response bandwidth is `peak requests/s × response size × 8`. The calculator uses decimal units: 1 kB is 1,000 bytes and 1 GB is 1,000,000,000 bytes.

Mean concurrent requests are estimated with `peak requests/s × mean latency in seconds`. This is an average relationship under the model assumptions. It does not prove that a worker pool can absorb an instantaneous burst.

## Worked example

Assume 1 million daily users, 10 requests per user per day, a 5× peak factor, 90% reads, 1 kB per new record, 2 kB responses, 365 days of retention, three data copies, and 200 ms mean latency.

- Daily requests: 10,000,000.
- Average rate: about 115.74 requests/s.
- Peak rate: about 578.70 requests/s, split into 520.83 reads/s and 57.87 writes/s.
- Raw retained data: 365 GB; three copies: 1,095 GB.
- Peak response bandwidth: about 9.26 Mb/s.
- Mean peak concurrency: about 115.74 requests.

Round only for presentation. Keep full precision through the calculation so small errors do not compound.

## Explore in the playground

Start with **Interview baseline** and predict an output before selecting **Calculate estimate**. Double only the peak factor: peak request rate, bandwidth, and concurrency should double, while daily storage stays fixed. Then reduce the read percentage and observe why write volume and storage rise.

Use the low/base/high range to state uncertainty explicitly. Open the calculation trail to check each formula and unit.

## Failures and tradeoffs

The largest error often comes from a weak assumption rather than arithmetic. A daily average hides traffic shape. A single mean response size hides endpoints with very different payloads. A replication factor omits indexes, write amplification, backups, and temporary data during maintenance.

Adding headroom can make a target more cautious, but it cannot repair an unrealistic workload model. Compare estimates with production measurements and load tests when they become available.

## In a real project

Write every assumption with an owner and evidence source. Use observed percentiles for traffic and payloads when possible. Calculate more than one scenario, identify which input moves the answer most, and revisit the sheet when product behavior changes.

Map each result to a design question: peak RPS informs service and dependency testing, writes per second inform ingestion, retained bytes inform storage layout, bandwidth informs network paths, and concurrency informs worker and connection limits.

## Interview practice

Say the assumptions before the arithmetic. Work in round numbers, carry units aloud, and explain why you chose each factor. Finish with the missing factors you would validate in a real system.

If mean peak concurrency is about 116 but 500 requests arrive together, explain that the mean relationship hides burst shape, queue capacity, worker limits, service time distribution, and dependency limits. Connect that answer back to the Request Flow playground.

## Teach it back

In two minutes, explain the path from daily users to peak RPS, retained storage, bandwidth, and concurrency. Include one assumption that affects each result and one reason the result should be expressed as a range.

## Further reading

- John D. C. Little's original paper establishes the long-run relationship between average items in a system, arrival rate, and average time in the system.
- Google SRE's chapter on load balancing discusses load, capacity, and the limits of simplified resource models.
- AWS Well-Architected guidance describes using data and load testing to make performance decisions.
