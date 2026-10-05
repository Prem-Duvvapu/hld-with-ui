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

Then run the node-failure preset, where Node B fails at 50 ms and recovers at 250 ms. Predict which requests finish before you run it.

## Failures and tradeoffs

A queue absorbs a short burst and gives workers time to catch up. During sustained overload it increases waiting time and memory use. A finite queue can reject early and protect the service, but callers need an explicit retry or fallback policy.

Round robin is cheap and predictable. Least outstanding reacts to visible work, but its view can be delayed and it may still make poor choices when requests have very different costs.

### Node failure

The node-failure preset uses the six-request baseline, with Node B failing at 50 ms and recovering at 250 ms. A failure schedule chooses what happens to work already assigned to the failed node:

| In-flight behavior | Node B's requests (2, 4, 6) | Node A's requests (1, 3, 5) |
| --- | --- | --- |
| **FAIL**: running and queued work is dropped | All three fail at 50 ms: request 2 was running, and requests 4 and 6 were queued | Complete at 100, 200, and 300 ms |
| **COMPLETE**: assigned work finishes | Complete at 100, 200, and 300 ms, as in the baseline | Complete at 100, 200, and 300 ms |

With FAIL, three requests complete and three fail, so throughput halves even though Node A never slowed down. Requests that arrive while a node is down are routed only to nodes that are up. A request completing exactly at the failure time succeeds, but queued work cannot start at that instant.

What this model leaves out matters for failures: the balancer learns about a failure **instantly**, and failed requests are **not retried**. A real load balancer finds out through health checks. For example, an AWS Application Load Balancer checks each target every 30 seconds by default and takes it out of service only after consecutive failed checks, so traffic keeps reaching a broken node for a while. Retries from clients would then add load to the surviving nodes. Network latency and cancellation are also excluded. These limits are shown in the playground so its output is not confused with a production benchmark.

## In a real project

Inspect per-node queue depth, active workers, rejected requests, and queue time separately from handler time. A rising queue with stable handler time points to saturation or burstiness. A rising handler time points to slower work or a dependency.

## Interview practice

Start with assumptions: number of nodes, worker capacity, queue policy, and workload shape. Trace one request end to end. Then explain what changes when one node slows down and name the signal you would monitor.

## Teach it back

Try this two-minute explanation: “The balancer chooses a node. That node has finite workers, so excess requests wait locally. End-to-end latency contains both waiting and service time. I would compare queue time, active workers, and rejections before deciding whether to change routing, add capacity, or shed load.”

Follow-ups:

- If node B becomes four times slower, explain why plain round robin can keep sending half the traffic there and what information a different policy would need.
- If node B fails and clients retry every failed request once, what happens to node A's queue? The model has no retries, but you can imitate them: add three arrivals at 50 ms to the FAIL preset. All three go to node A, queue behind requests 3 and 5, and finish at 400, 500, and 600 ms.

**A tempting wrong explanation.** “Request 5 took 300 ms, so the service code is slow.” The trace disproves it: request 5's service time is 100 ms, like every other request. It waited 200 ms in node A's queue behind requests 1 and 3. The fix is capacity or admission control, not faster handler code.

## Further reading

- [Google SRE Book: Handling Overload](https://sre.google/sre-book/handling-overload/)
- [AWS Builders' Library: Using load shedding to avoid overload](https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/)
- [AWS: Health checks for Application Load Balancer target groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html): routing only to healthy targets, check intervals, and failure thresholds
