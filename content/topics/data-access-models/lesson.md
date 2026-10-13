# Data Models & Access Patterns

Your order page asks for one customer's recent orders. An operations dashboard asks for
everyone's recent orders. Both use the same records, but grouping records for one question
can make the other question examine more entries. Learn to choose keys and indexes from
the reads you need and the rules your writes must preserve.

This draft offers Playground, Study and Practice. Its Java experiment counts work in a
small, sequential access-path model. It does not run a database, measure latency, or
implement concurrent transactions, crashes, replication or idempotency.

## Learning outcomes

- Turn a feature into explicit lookup, range and write access patterns.
- Compare candidate index entries, fetched base records and returned records separately.
- Explain why changing a composite index's column order changes the modeled scan.
- Distinguish unique record IDs from a tenant's unique business key.
- Defend a storage family using query shape, ownership and correctness requirements.

## Explain it simply

Think of an order register and a sorted directory pointing into it. A directory grouped
by customer keeps that customer's entries together. A directory grouped by creation order
keeps a global creation range together. An **index** is that extra access structure; an
**access pattern** is a question or change the application needs to perform.

An index helps locate records. A **constraint** states which data is allowed. Finding a
record quickly and preventing two records from representing the same business order are
different responsibilities.

## Prerequisites

Review **Capacity Estimation** through All modules. Bring its habit of stating units,
population and assumptions. Here, the quantities are records and logical work counts.
The `createdOrder` field is an integer ordering key, not milliseconds or a measured date.

## Mental model

```text
Read: question → chosen access path → candidate entries → matching records → returned records

Write: proposed record → primary ID check → optional tenant/business-key check
                                               ↓ accepted
                              base record + configured index maintenance
```

The first line means that an entry considered during a scan need not become a fetched
record, and a fetched match need not be returned when the result limit is smaller.
The second line means that a rejected insert changes neither records nor index entries.
Each run starts from its submitted rows and executes operations in their listed order.
Another run has separate state; an accepted insert is not stored in a database between runs.

## How it works

Each record has an `id`, `tenant`, `businessKey` and `createdOrder`. The experiment supports
an ID lookup, a tenant range, an all-tenant range and an insert. Ranges include both endpoints.
The available range access paths are:

| Choice                      | Grouping                     | Modeled range behavior                                |
| --------------------------- | ---------------------------- | ----------------------------------------------------- |
| No secondary index          | Submitted record order       | Examine every base record and test the query          |
| Tenant, then creation order | `(tenant, createdOrder, id)` | A tenant range visits that tenant's bounded interval  |
| Creation order, then tenant | `(createdOrder, tenant, id)` | A creation range visits every tenant in that interval |

For a tenant query using the creation-first index, Java tests the tenant in the index
before fetching the base record. For a global query using the tenant-first index, this
model examines the entire index and tests the creation range there before fetching.
An ID lookup instead performs one abstract primary-key lookup, with one fetched record
on a hit and none on a miss, regardless of the configured secondary index.

Queries evaluate their complete candidate interval before applying the result limit.
Matched and returned records sort by creation order, then ASCII record ID. A limit can
reduce the returned count without reducing the preceding work in this model. Candidate
order follows the chosen access path and need not match returned order.

On insert, primary ID uniqueness always applies. If business-key protection is enabled,
the pair `(tenant, businessKey)` must also be unique. Two different tenants may use the
same business key. A duplicate ID is checked first and rejected before a business-key check.
A rejected business-key insert reports the conflicting existing record.

An accepted insert counts one base write, one secondary-index maintenance entry when an
index is configured, and one business-key maintenance entry when protection is enabled.
Primary-key maintenance is included in the base write. These are **logical work units**,
not disk writes, bytes, milliseconds or a formula for overall speed. Keep the categories
separate; adding them does not produce a database cost estimate.

The model excludes optimizer decisions, skip scan, early stopping, covering indexes,
index intersection and storage pages. Real PostgreSQL can use additional strategies,
including skip scan; a different column order does not make an index universally unusable.
See [PostgreSQL's multicolumn-index rules](https://www.postgresql.org/docs/18/indexes-multicolumn.html).

## Worked example

The seven presets share twelve initial records: four each for `alpha`, `beta` and `gamma`.
Within each tenant, creation orders are 10, 20, 30 and 40; business keys are `k1` through `k4`.
Record IDs are `a1`–`a4`, `b1`–`b4` and `g1`–`g4`.

Ask for tenant `beta`, creation orders **20 through 30**, with limit 20:

| Access path                 | Index seeks | Index entries examined | Base records examined/fetched | Matched | Returned |
| --------------------------- | ----------: | ---------------------: | ----------------------------: | ------: | -------: |
| No secondary index          |           0 |                      0 |                            12 |       2 |        2 |
| Tenant, then creation order |           1 |                      2 |                             2 |       2 |        2 |
| Creation order, then tenant |           1 |                      6 |                             2 |       2 |        2 |

Every path returns `b2, b3`. The creation-first candidates are
`a2, b2, g2, a3, b3, g3`. Testing tenant `beta` in those six index entries leaves two
records to fetch. More index scanning does not imply six fetched records.

Now remove the tenant restriction while keeping the same range. The tenant-first index
examines 12 entries and fetches six records. The creation-first index examines six entries
and fetches six records. Both return `a2, b2, g2, a3, b3, g3`. The question changed, so the
grouping that reduced candidate work changed too.

For a write, propose `b5 / beta / k2 / 25`. With business-key protection, it conflicts with
`b2`: one primary lookup and one business-key check, zero writes, and still twelve records.
The following beta query still returns `b2, b3`. With protection disabled, the same insert
is accepted: thirteen records, one base write, one secondary-index maintenance entry,
no business-key check or maintenance, and query results `b2, b5, b3`.

The **Insert a new business key** preset instead uses the unused key `k5`. With protection enabled,
that insert succeeds with one base write, one secondary-index maintenance entry and one
business-key maintenance entry. Its following query also returns `b2, b5, b3`.

## Explore in the playground

1. Choose **Tenant-first lookup**. Predict the beta query's candidate, fetched and returned counts,
   then run it. Inspect the submitted input and operation evidence.
2. Choose **Remove the secondary index**, run, and explain why the returned IDs stay the same while base work rises.
3. Choose **Created order first**, run, and distinguish six index candidates from two fetched records.
4. Choose **Range across every tenant**. Predict the six returned records and twelve examined index entries.
   Change the index to creation-first and run again; now only six index entries are examined.
5. Choose **Reject a duplicate business key**, then **Remove business-key enforcement**. Compare the insert decision, conflicting record,
   final record count and following query. Protection disabled is an intentional rule change.
6. Choose **Insert a new business key** and account for its three separate maintenance categories.
7. Change the baseline query limit from 20 to 1. It returns only `b2`, but still examines
   two index entries and fetches both matching records. Explain the model's limit rule.

Changing controls requires a new run; a displayed result belongs to the input submitted
for that run. Selecting operation evidence does not perform another query. Use Practice
to save an explanation and compare it with a reference; Playground predictions stay on the page.

## Failures and tradeoffs

**Tempting wrong explanation:** “Both columns are in the index, so column order cannot matter.”
The beta query returns the same records, but the modeled creation-first scan considers
six entries instead of two. The mechanism is how records are grouped, not whether the
column names appear somewhere in the index.

**Another wrong explanation:** “A completed run means every insert succeeded.” A run can
complete with an intentionally rejected insert. Read the operation's decision and conflict
before interpreting the final rows.

An additional access structure has maintenance and storage costs. The experiment counts
accepted maintenance entries; it does not estimate storage or physical write amplification.
[PostgreSQL documents the overhead of keeping indexes synchronized](https://www.postgresql.org/docs/18/indexes-intro.html).

Initial rows must already satisfy the enabled constraints. Invalid input is rejected;
a valid insert that conflicts with existing data produces a rejected operation. An empty
query result is valid and distinct from an unavailable API. Neither rejected writes nor
network errors should produce a fabricated successful result.

## In a real project

Write down the operations before choosing a product: filters, ordering, result size,
read/write frequency, entity relationships and rules that must remain true. Then choose
data organization and verify the selected system's actual guarantees.

| Storage family | Question that makes it useful to consider                                                | Choice to defend                                                                           |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Relational     | Which orders, customers and line items relate, and which combinations must be valid?     | Tables, joins and declared constraints; index the important reads                          |
| Document       | Which related fields are usually read or changed as one aggregate?                       | Embed or reference related data; weigh repeated data and updates                           |
| Key-value      | Can the caller provide the exact key for the object it needs?                            | Define key ownership; add an explicit access structure for other query shapes              |
| Wide-column    | Can an important query name a partition and read an ordered slice inside it?             | Design partition and clustering keys; account for duplicate query-specific representations |
| Graph          | Does the feature follow relationships, such as connections between accounts and devices? | Model entities and relationships; bound traversal depth and result size                    |

These families overlap in real products. They do not determine transaction scope,
consistency or performance by themselves. An order-by-ID read alone does not justify
moving an entire service to a different database.

Primary references explain [relational constraints](https://www.postgresql.org/docs/18/ddl-constraints.html),
[document access patterns](https://www.mongodb.com/docs/manual/data-modeling/),
[key-value retrieval](https://redis.io/docs/latest/develop/data-types/strings/),
[Cassandra's query-driven design](https://cassandra.apache.org/doc/latest/cassandra/developing/data-modeling/intro.html)
and [property-graph entities and relationships](https://neo4j.com/docs/getting-started/data-modeling/).
Their product-specific features are references, not behavior implemented by this experiment.

For a slow tenant-order endpoint, inspect the actual query plan, candidate rows, fetched
rows, returned rows, query distribution and write load. Try a candidate index against a
representative workload and check correctness plus resource cost before rolling it out.
This Java model cannot supply production timing evidence.

## Interview practice

Use a two-minute explanation with six steps:

1. State the required read and write operations.
2. Name the business invariant and its scope.
3. Propose a simple record shape and primary identity.
4. Choose an access path and trace one read with numbers.
5. Trace an accepted and rejected write, including maintained structures.
6. Defend the tradeoff and say what production evidence you would need.

Follow-up one: the product adds a dashboard querying every tenant. Explain why a tenant-first
index can examine more entries for that new question and discuss adding another access path.
Follow-up two: two clients concurrently submit the same business order. A sequential check
is insufficient evidence of safety; identify a database-enforced atomic boundary and verify
its actual guarantees. The concurrent model belongs to the planned Transactions & Isolation module.

Detailed storage engines belong to the planned Indexes & Storage module. These successor
topics are not executable views in this draft, and draft publication and human review remain pending.

## Teach it back

Explain to a teammate: “The beta query returns two records under either index. In this
model, grouping by tenant first considers two index entries; grouping by creation first
considers six but still fetches only two records. I would check our real query distribution
and plans before changing the index. Business-key uniqueness is a separate write rule.”

Now apply the idea to a support-ticket page filtered by team and an operations page filtered
only by creation order. Write your first design, reveal a Practice reference and revise it.
Self-check for a clear question, accurate grouping mechanism, stated scan assumptions,
separate work counts, write cost, invariant scope and one changed-condition follow-up.
Do not treat a saved answer or successful run as an automatic grade.

## Further reading

- [PostgreSQL 18 multicolumn indexes](https://www.postgresql.org/docs/18/indexes-multicolumn.html): leading columns, residual conditions and skip scan.
- [PostgreSQL 18 index introduction](https://www.postgresql.org/docs/18/indexes-intro.html): maintained access structures and write overhead.
- [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html): primary keys, scoped uniqueness and foreign keys.
- [MongoDB data modeling](https://www.mongodb.com/docs/manual/data-modeling/): access patterns and embedding/reference choices.
- [Redis strings](https://redis.io/docs/latest/develop/data-types/strings/): values retrieved by a named key.
- [Apache Cassandra data modeling](https://cassandra.apache.org/doc/latest/cassandra/developing/data-modeling/intro.html): query-driven tables and partition/clustering keys.
- [Neo4j graph data modeling](https://neo4j.com/docs/getting-started/data-modeling/): entities, relationships and properties.
