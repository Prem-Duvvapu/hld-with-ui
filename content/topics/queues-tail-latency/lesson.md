# Queues & Tail Latency

A queue gives work somewhere to wait when every worker is busy. It can absorb a short
burst, but waiting takes time. Use this module to decide whether to add waiting space,
add processing capacity, or reject excess work. This is a draft learning module with an
illustrative Java model, not a benchmark of a particular broker or thread pool.

## Learning outcomes

- Separate waiting time from service time and total job latency.
- Predict which jobs are admitted when worker and waiting slots are finite.
- Compare buffering, worker count and individual service times using a trace.
- Explain what successful latency excludes when jobs are rejected or unfinished.

## Explain it simply

Imagine one person serving customers and one chair for someone waiting. The person can
serve one customer while another waits. When four customers arrive together, two can stay
and two must leave. Adding chairs admits more customers; it does not make the person faster.

In the model, a **worker** processes one job at a time. A **waiting slot** holds a job that
has not started. A **FIFO queue** starts waiting jobs in the order they entered.
**Tail latency** describes slower responses in a stated population, rather than its average.

## Prerequisites

Review Request Flow & Load Balancing and Capacity Estimation first. Use **All modules**
to open those published modules. Request flow uses a separate queue at each service node. This module uses one shared waiting queue for the whole worker
pool, and each job can take a different amount of service time.

## Mental model

```text
Arriving job → idle worker available? → start processing
                     ↓ no
              waiting slot available? → shared FIFO queue → next free worker
                     ↓ no
                  reject job
```

Running jobs occupy worker slots. Waiting jobs occupy queue slots. Capacity of one worker
and one waiting slot therefore allows two admitted jobs at once. A queue capacity of zero
still permits an idle worker to start a job.

The diagram is a decision flow: arrivals first use idle workers, otherwise wait if there
is space, otherwise are rejected. A worker completes its current job before taking the
oldest waiter. The model has no durable broker, acknowledgment, retry or duplicate effect.

## How it works

Java processes virtual timestamps. At a timestamp it completes all due jobs, assigns existing
waiters to idle workers, then handles new arrivals in input order. A new arrival immediately
reserves an idle worker; it cannot take a slot ahead of an existing waiter.

For a completed job:

```text
waiting time = start time − arrival time
service time = completion time − start time
latency = completion time − arrival time = waiting time + service time
```

Workers are identical in this model; service duration belongs to the job. A scheduled
completion shown on a worker card is a future plan. It becomes an observed completion only
when Java emits that event. Playback speed changes presentation, not virtual timing.

## Worked example

Select **One waiting slot**: four jobs arrive at 0 ms, one worker takes 10 ms per job,
and one job can wait.

| Job | Decision at 0 ms | Start | Completion | Waiting | Successful latency |
| --- | --- | --- | --- | --- | --- |
| job-1 | Starts on worker-1 | 0 ms | 10 ms | 0 ms | 10 ms |
| job-2 | Waits | 10 ms | 20 ms | 10 ms | 20 ms |
| job-3 | Rejected | Unavailable | Unavailable | Unavailable | Unavailable |
| job-4 | Rejected | Unavailable | Unavailable | Unavailable | Unavailable |

Two jobs complete; two are rejected. Mean successful latency is `(10 + 20) / 2 = 15 ms`.
Nearest-rank p95 uses rank `ceil(0.95 × 2) = 2`, so it is 20 ms. This is only two successful
samples, not a reliable production tail estimate. Rejected jobs are a separate population,
not zero-latency successes.

Select **More waiting space**: the same worker admits all four. Waiting times become
0, 10, 20 and 30 ms; completion latencies become 10, 20, 30 and 40 ms. Mean successful
latency is 25 ms and nearest-rank p95 is 40 ms over four samples. Both jobs admitted and
sample population changed. State the rejection count alongside latency when comparing them.

## Explore in the playground

1. Predict how many jobs complete and how many are rejected with one waiting slot.
2. Run the preset, select the initial state, then step to job-2 waiting and job-3 rejection.
3. At 10 ms, inspect job-1 completing before job-2 starts. Follow the queue and worker cards.
4. Increase waiting capacity to three, run again and explain the changed counts and waiting.
5. Try **More workers**: two workers and one waiting slot admit three jobs; one is rejected.
6. Try **Slow first job**: a 100 ms job makes three 1 ms jobs wait behind it on one worker.
   Their completion latencies are 101, 102 and 103 ms although their service takes only 1 ms.
7. Try **Virtual-time limit**: the job arrives at 60,000 ms and is still running when the
   model cannot advance to its 70,000 ms completion. Successful latency remains unavailable.

Editing controls keeps an earlier result labeled with its submitted inputs until you run
again. Step, seek, reset and tab changes do not submit another simulation.

## Failures and tradeoffs

| Choice | Helps when | Cost or limitation |
| --- | --- | --- |
| More waiting space | A bounded burst can drain before the caller's useful deadline | More admitted work may wait longer; it does not create worker capacity |
| More workers | The underlying CPU, dependency and memory budgets support concurrency | A real dependency can become the next bottleneck; this model does not simulate it |
| Reject excess work | Serving every arrival would exceed the chosen admission boundary | Callers need a clear failure response and a deliberate retry or fallback policy |

Queue limits and early rejection are real overload tools, but this model's fixed service
durations omit resource contention. Google describes limiting accepted load and handling
overload deliberately; apply those principles within your own system's constraints.
[Google SRE: Handling Overload](https://sre.google/sre-book/handling-overload/).

An event, byte or time guard can stop a run with jobs not arrived, waiting or running.
The trace then represents a prefix. Successful statistics describe completed jobs only;
they do not prove the unfinished jobs will meet a deadline. An empty completed population
has unavailable statistics, not an average of zero. A completed simulation can still
contain rejected jobs; “completed” describes model execution, not universal business success.

## In a real project

If an image-processing service slows down, inspect arrivals, queue depth, waiting age,
service duration, rejection and worker utilization separately. Decide the acceptable waiting
budget before increasing buffer size. Measure CPU/dependency contention before increasing
workers; the model does not estimate that cost.

A tempting wrong explanation is “the average fell, so every user is better off.” Rejecting
slow or excess work can remove it from successful latency statistics. Check the denominator
and rejected/unfinished populations before making that claim. AWS explains load shedding as
rejecting excess work so useful work can continue.
[AWS: Using load shedding to avoid overload](https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/).

Java's `ThreadPoolExecutor` documentation explains how worker bounds and work queues
interact. Its actual growth/rejection policies are richer than this fixed-worker model;
this module does not emulate that implementation.
[Java 17 ThreadPoolExecutor](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html).

## Interview practice

Use this two-minute structure:

1. Name the workload and acceptable latency/rejection requirement.
2. State worker capacity and waiting capacity separately.
3. Trace one job that runs and one that waits or is rejected.
4. Give successful latency with its sample count, plus rejection and outstanding counts.
5. Choose a change and name the resource or deadline that limits it.

Follow-up: “Traffic doubles continuously rather than briefly.” More waiting space only buys
time if processing cannot keep up; investigate admission, actual service capacity and workload.
Follow-up: “Only one job becomes slow.” FIFO can delay short jobs behind it; compare more
workers or a different scheduling policy under explicit fairness constraints. Alternative
scheduling is a design discussion, not another implemented policy in this model.

## Teach it back

Explain to a teammate: “With one worker and one waiting slot, two of our four jobs are
rejected. Three waiting slots admit all four but raise mean successful latency from 15 to
25 ms. I would choose the buffer from our waiting budget, then measure whether we can safely
add workers.” Use the timeline as evidence instead of memorizing the sentence.

Self-check: did you name the input, explain the cause, show numbers with their population,
state an assumption, and defend a tradeoff? Then explain an export job that arrives late
or takes much longer than the others. Revise your answer after comparing the Practice reference.

## Further reading

- [Google SRE: Handling Overload](https://sre.google/sre-book/handling-overload/) — admission and overload context.
- [AWS: Using load shedding to avoid overload](https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/) — protecting useful work during excess load.
- [Java 17 ThreadPoolExecutor](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html) — real executor policy details beyond this model.
