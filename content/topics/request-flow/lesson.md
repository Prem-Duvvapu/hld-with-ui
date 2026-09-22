# Request Flow & Load Balancing

A load balancer chooses a service node, but a request still waits when that node's workers are busy. This module helps you separate **routing time**, **queue time**, and **service time** so you can explain where latency really comes from.

## Learning outcomes

- Trace one request from arrival to completion or rejection.
- Explain why a 300 ms response can contain only 100 ms of service work.
- Compare routing policies using the same workload and explicit assumptions.

## Explain it simply

Imagine two checkout counters. A greeter sends each customer to a counter. The greeter can distribute people fairly, but cannot make a busy cashier work faster. When both cashiers are busy, customers wait in a line.

In a service, the load balancer is the greeter, instances are checkout counters, workers are cashiers, and each instance's queue is its line.

## Prerequisites

You only need to know that a client sends a request and a server returns a response. No distributed-systems background is required.

## Mental model

Every request moves through five possible moments:

1. It **arrives** at the balancer.
2. The policy **routes** it to one eligible node.
3. It either **starts** immediately or **waits** in that node's queue.
4. It **completes** after its service time.
5. It is **rejected** instead if that node's workers and waiting slots are full.

Response latency is `completion time − arrival time`. For a successful request, this model divides it into queue time plus service time.

## How it works

**Round robin** cycles through nodes A, B, A, B. It is simple and does not inspect their current work.

**Least outstanding** selects the node with the fewest queued and running requests. Ties use stable node order, which keeps replay deterministic. This simplified policy knows outstanding requests; it does not model real network connections.

Each node has a finite number of workers and waiting slots. A worker handles one request at a time. A waiting slot stores one queued request. When both are full, the node rejects new work routed to it.

## Worked example

Six requests arrive at time 0. Nodes A and B each have one worker, each request needs 100 ms, and round robin assigns A/B/A/B/A/B.

| Requests | Queue time | Service time | Total latency |
| --- | ---: | ---: | ---: |
| 1 and 2 | 0 ms | 100 ms | 100 ms |
| 3 and 4 | 100 ms | 100 ms | 200 ms |
| 5 and 6 | 200 ms | 100 ms | 300 ms |

Request 5 is slow because it waits behind requests 1 and 3 on node A. The service code still takes 100 ms. This distinction tells an engineer whether to investigate application work, worker capacity, or admission control.

## Explore in the playground

Run the baseline preset and step to request 5. Then reduce queue capacity to one. Requests 5 and 6 are rejected because each node already has one running and one waiting request.

Switch to the slow-node preset. Compare the two policies using the same arrival schedule. The result applies to this modeled workload; neither policy is universally faster.

## Failures and tradeoffs

A queue absorbs a short burst and gives workers time to catch up. During sustained overload it increases waiting time and memory use. A finite queue can reject early and protect the service, but callers need an explicit retry or fallback policy.

Round robin is cheap and predictable. Least outstanding reacts to visible work, but its view can be delayed and it may still make poor choices when requests have very different costs.

This first model omits network latency, health-check delay, retries, cancellation, and node failure. Those limits are shown in the playground so its output is not confused with a production benchmark.

## In a real project

Inspect per-node queue depth, active workers, rejected requests, and queue time separately from handler time. A rising queue with stable handler time points to saturation or burstiness. A rising handler time points to slower work or a dependency.

## Interview practice

Start with assumptions: number of nodes, worker capacity, queue policy, and workload shape. Trace one request end to end. Then explain what changes when one node slows down and name the signal you would monitor.

## Teach it back

Try this two-minute explanation: “The balancer chooses a node. That node has finite workers, so excess requests wait locally. End-to-end latency contains both waiting and service time. I would compare queue time, active workers, and rejections before deciding whether to change routing, add capacity, or shed load.”

Follow-up: If node B becomes four times slower, explain why plain round robin can keep sending half the traffic there and what information a different policy would need.

## Further reading

- [Google SRE Book: Handling Overload](https://sre.google/sre-book/handling-overload/)
- [AWS Builders' Library: Using load shedding to avoid overload](https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/)
