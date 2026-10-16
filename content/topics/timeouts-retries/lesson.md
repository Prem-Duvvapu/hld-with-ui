# Timeouts & Retries

A slow call leaves a caller with a question: should it wait, try again or give up?
Follow one request, see what its attempts do to a shared server, and choose a bounded policy.
This draft uses an illustrative Java model, not production measurements.

## Learning outcomes

- Separate a caller's waiting from accepted server work.
- Trace original requests, retry attempts and completed work independently.
- Compare immediate retries, capped backoff, seeded jitter and a finite retry budget.
- Explain an attempt timeout, an overall deadline and a blocked retry proposal.
- Defend a retry decision while stating what is unknown about business effects.

## Explain it simply

**A timeout tells the caller to stop waiting. It does not, by itself, prove that accepted work stopped.**
In this experiment, accepted work continues. A retry can therefore add work while an earlier
attempt is still queued or running. Real cancellation behavior depends on the protocol and
application: [gRPC's deadline guide](https://grpc.io/docs/guides/deadlines/) distinguishes
cancelling an RPC from the server application's responsibility to stop its spawned activity.
This model implements neither cancellation mechanism.

Think of asking for a report. You stop watching after 50 ms and submit again, while the
first report is still being prepared. Before retrying, distinguish the response you missed
from the work the server may already be doing.

## Prerequisites

Use Request Flow & Load Balancing to separate waiting and service time. The Queues & Tail
Latency draft introduces finite worker and waiting slots. These technical prerequisites exist;
this topic remains outside published discovery while its release reviews are pending.

## Mental model

| Fact | What it means here |
| --- | --- |
| Original request | One caller's intended operation, with one overall deadline |
| Attempt | One send, including its own caller wait and admission decision |
| Accepted work | A queued or running unit the server will complete |
| Caller response | Completion of the exact attempt the caller is still awaiting |
| Business effect | Not modeled: completing work does not establish a payment, record or notification |

Caller and server state are independent. **Timed out / Still queued** is a valid combination.
The same attempt can later become **Timed out / Completed** without making its caller succeed.
Java reports these states; playback does not execute the system again.

## How it works

1. An original arrives. Its overall deadline is arrival plus the configured overall timeout.
2. For accepted work, attempt timeout is measured from send, including queue wait.
   Immediate rejection has no running timeout or accepted-work deadline history.
3. An unavailable dependency or full waiting queue rejects immediately. Otherwise work starts
   on an idle worker or joins the FIFO waiting queue. Running work does not occupy waiting slots.
4. A timeout ends that attempt's caller wait. Its accepted work stays queued or running.
5. Retry policy checks maximum attempts, then the remaining shared budget, then the chosen delay.
   Maximum attempts includes the original. Planning reserves no budget; actual retry sends consume it.
6. A proposed retry at or beyond the overall deadline is blocked. The caller waits until the
   actual overall deadline to fail; no future attempt row is invented.
7. Only completion of the currently awaited attempt succeeds the original. Late responses
   cannot revive it or satisfy a newer attempt. The result ends after callers terminate and work drains.

Immediate retries use no delay. Exponential backoff increases the delay up to a cap; FULL
jitter chooses an integer from zero through that cap. These are tools for managing retry load,
with benefits depending on the failure and workload. [AWS's retry discussion](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
and [backoff/jitter article](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
explain their motivation. This Java experiment uses authored failures and one recorded seeded
stream; it does not emulate an AWS SDK or guarantee that jitter improves every run.

**Declared tie rule:** completion exactly at an attempt or overall deadline wins. Overall
deadline precedes attempt timeout at equality; original sends precede same-time retry sends.
FIFO promotion happens before new sends. These are model rules, not a real network scheduler.
Several events can share one time while exposing separate causal steps.

## Worked example

Choose **A timeout leaves server work running** (`late-work`). One request arrives at 0 ms,
service takes 80 ms, one worker is available, two attempts are allowed, the attempt timeout
is 50 ms and the overall timeout is 500 ms. Retry is immediate; the queue has two waiting slots.

| Time | Caller observation and server work |
| --- | --- |
| 0 ms | `a-a1` is sent and starts work |
| 50 ms | `a-a1` times out; `a-a2` is sent and waits behind it |
| 80 ms | `a-a1` completes late; `a-a2` starts |
| 100 ms | `a-a2` times out; maximum attempts is reached and the original fails |
| 160 ms | `a-a2` completes late; all accepted work has drained |

The complete Java result reports one original, two sends, two completed work units, two late
completions and one failed original. Attempts per original = 2/1 = 2; completed work per
original = 2/1 = 2. Neither ratio establishes duplicate business effects. The caller failed
at 100 ms; 160 ms is the end of observed work drainage, not successful caller latency.

Change only the attempt timeout to 100 ms. The original receives its first response at
80 ms: one send, one completion and no retry. A longer wait helps this authored healthy
workload; it can also keep real caller resources occupied longer.

## Explore in the playground

Write an optional prediction, choose a scenario and explicitly run it. Edits never run Java
automatically. Advanced controls expose dependency capacity/recovery and jitter/budget settings.
The workload editor lets you change IDs, arrivals and service times; arrivals must stay ordered.

- **Let the healthy response arrive:** compare a 100 ms wait with the default 50 ms wait.
- **A retry meets a full admission boundary:** set waiting capacity to zero. The first work
  still completes, while the retry is rejected. Rejection is different from a caller timeout.
- **Immediate retries spend attempts during an outage:** three sends at 0 ms all reject
  while the dependency is unavailable until 60 ms.
- **Backoff can reach a recovered dependency:** delays 40 and 80 ms produce sends at 0, 40
  and 120 ms; the third runs for 20 ms and succeeds at 140 ms.
- **A proposed retry would miss the deadline:** overall timeout 100 blocks the 120 ms proposal
  at 40 ms. Inspect AWAITING_DEADLINE, then the actual failure at 100 ms.
- **Planning a retry does not reserve a shared token:** both originals plan sends for 40 ms, but a
  one-retry batch budget permits only one actual retry send.
- **Inspect seeded retry delays:** replay seed 42, then change the seed. Compare Java's chosen
  delays and actual outcomes rather than assuming the new seed is better.

Select initial state and individual events, then seek backward and forward. Inspect caller,
waiting queue, workers and actual sent attempts. Whole-run metrics stay separate from the
selected snapshot. Play speed changes presentation only; manual controls remain available.
Study and Practice are available; Guided and authored design views are a later contribution.

## Failures and tradeoffs

| Choice | Potential benefit | Cost or limit |
| --- | --- | --- |
| Wait longer | Avoid unnecessary retries for a healthy slow response | Caller resources and user patience remain occupied |
| Retry immediately | Reach a usable dependency sooner when failure is brief | Can spend attempts while the same failure persists |
| Back off | Give a recovering dependency time before another send | A longer delay may miss the caller's deadline |
| Add jitter | Change retry timing across callers | One finite run need not improve; randomness is not extra capacity |
| Bound retries | Limit additional sends | Some callers fail even if recovery happens later |
| Increase waiting space | Admit more work | Accepted work can wait beyond its caller's usefulness |

**Tempting wrong explanation:** “The caller failed, so the server performed no work.” The
80/160 ms completions disprove that in the default trace. Conversely, two completions here
do not prove that a real business operation happened twice: this model has no effect ledger.

The shared budget is a fixed number of retry sends for this batch. It is not a replenishing
token bucket or percentage of recent traffic. [Google SRE's overload chapter](https://sre.google/sre-book/handling-overload/)
discusses request/client retry budgets and retry ownership; its production policies are
separate from this deliberately small experiment.

A valid modeled caller failure is still a complete simulation result. A rejected API request,
oversized response or unavailable simulation server produces an explicit error instead;
the app must not substitute a fabricated partial trace.

## In a real project

For a report-export dependency, decide how long a result remains useful, which layer owns
retries, which errors may be transient and what accepting extra work costs. Inspect original
request IDs, attempt counts, queue age, late work and final caller outcomes. Validate timeout
choices against real network and service distributions; this model supplies no recommended
production milliseconds.

Before retrying a write, identify its business-effect and result boundary. Use an appropriate
idempotency design and examine uncertain responses. This topic does not implement deduplication,
durable rollback, broker delivery or an exactly-once guarantee. Cancellation, nested retry layers,
connection setup and real measurements require additional implementation and evidence.

## Interview practice

Use a two-minute structure:

1. **Requirement:** how long is the result useful, and are repeated effects acceptable?
2. **Mechanism:** distinguish an original, its attempts and accepted server work.
3. **Evidence:** explain the default 50/80/100/160 ms trace and its separate populations.
4. **Policy:** choose a retry owner, bounded attempts, overall deadline, delay and budget.
5. **Tradeoff:** discuss recovery opportunity, extra load and effect safety.
6. **Limit:** state what the illustrative model omits and what production signals you need.

Changed condition: the dependency takes 300 ms instead of 80 ms. Explain why repeatedly
sending at 50 ms may add work before recovery rather than creating capacity.

Changed condition: a write may finish before its response is lost. What evidence and
idempotency boundary would you require before a retry? State that response uncertainty is
not directly simulated here.

## Teach it back

Explain to a teammate: “Our caller stopped waiting after 50 ms, while accepted work continued.
Retrying created another unit of work. Let's separate caller outcomes from server completions,
choose a useful overall deadline, and check effect safety before changing retry policy.”

Speak without reading the screen. Self-check: did you identify the problem, trace both attempts,
use the actual numbers, distinguish timeouts from rejection, explain a tradeoff and state a limit?
Revise your explanation in Practice; the app saves your reasoning locally without claiming mastery.

## Further reading

- [AWS: Timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) — caller waits, retry load and effect safety.
- [AWS: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — workload-specific comparisons; no graphs or implementation copied here.
- [Google SRE: Handling Overload](https://sre.google/sre-book/handling-overload/) — overload and bounded retry ownership.
- [gRPC: Deadlines](https://grpc.io/docs/guides/deadlines/) — deadline propagation and application cancellation responsibility; this model does not emulate gRPC.
