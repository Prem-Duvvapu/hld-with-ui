package com.hld.dataaccess;

import com.hld.dataaccess.DataAccessInput.IndexOrder;
import com.hld.dataaccess.DataAccessInput.Kind;
import com.hld.dataaccess.DataAccessInput.Operation;
import com.hld.dataaccess.DataAccessInput.Row;
import com.hld.dataaccess.DataAccessResult.AccessPath;
import com.hld.dataaccess.DataAccessResult.Conflict;
import com.hld.dataaccess.DataAccessResult.ConflictReason;
import com.hld.dataaccess.DataAccessResult.Outcome;
import com.hld.dataaccess.DataAccessResult.Work;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Pure finite sequential access analysis; all mutable state belongs to one call. */
public class DataAccessAnalyzer {
    public static final String SIMULATION_ID = "data-access-models";
    public static final List<String> ASSUMPTIONS = List.of(
            "This is an illustrative access-path analysis, not a database emulator or measured benchmark.",
            "Created order is an integer ordering key, not milliseconds; no latency is modeled.",
            "Operations run sequentially. There is no concurrency, durability, transaction or idempotency model.",
            "Ordered secondary entries use the configured fields followed by record ID; no optimizer, skip scan, index intersection or physical pages are modeled.",
            "Range queries inspect their full candidate interval and fetch matches before applying the result limit.",
            "Index-covered residual filters run before base-row fetches; counts describe logical entries and rows, not disk I/O.",
            "Accepted inserts append one base record and maintain one entry per configured access structure; primary-index maintenance is included in the base write.",
            "One index seek is an abstract path-opening action even when the full index is scanned; it does not measure tree navigation.");
    private static final Comparator<Row> RETURN_ORDER = Comparator.comparingInt(Row::createdOrder).thenComparing(Row::id);
    private static final Comparator<Row> TENANT_ORDER = Comparator.comparing(Row::tenant).thenComparingInt(Row::createdOrder).thenComparing(Row::id);
    private static final Comparator<Row> CREATED_ORDER = Comparator.comparingInt(Row::createdOrder).thenComparing(Row::tenant).thenComparing(Row::id);

    public DataAccessResult run(DataAccessInput input) {
        DataAccessValidator.validate(input);
        List<Row> rows = new ArrayList<>(input.rows());
        Map<String, Row> primary = new LinkedHashMap<>();
        Map<BusinessKey, Row> business = new LinkedHashMap<>();
        for (Row row : rows) {
            primary.put(row.id(), row);
            if (input.enforceBusinessKey()) business.put(key(row), row);
        }
        List<Outcome> outcomes = new ArrayList<>();
        Work totals = Work.ZERO;
        for (Operation operation : input.operations()) {
            Outcome outcome;
            if (operation.kind() == Kind.INSERT) outcome = insert(input, operation, rows, primary, business);
            else if (operation.kind() == Kind.LOOKUP_ID) outcome = lookup(operation, rows.size(), primary);
            else outcome = range(input.indexOrder(), operation, rows);
            outcomes.add(outcome);
            totals = totals.plus(outcome.work());
        }
        return new DataAccessResult(SIMULATION_ID, DataAccessInput.SCHEMA_VERSION,
                DataAccessInput.MODEL_VERSION, "analysis", "completed", input, outcomes, rows, totals, ASSUMPTIONS);
    }

    private static Outcome lookup(Operation operation, int count, Map<String, Row> primary) {
        Row row = primary.get(operation.rowId());
        List<String> ids = row == null ? List.of() : List.of(row.id());
        int found = ids.size();
        return new Outcome(operation.id(), operation.kind(), AccessPath.PRIMARY_KEY, ids, ids, ids,
                count, count, new Work(1, 0, 0, found, found, found, 0, 0, 0, 0),
                "One primary-key lookup " + (row == null ? "found no record." : "fetched record " + row.id() + "."), null, null);
    }

    private static Outcome range(IndexOrder order, Operation operation, List<Row> rows) {
        List<Row> candidates;
        AccessPath path;
        if (order == IndexOrder.NONE) {
            candidates = List.copyOf(rows);
            path = AccessPath.TABLE_SCAN;
        } else if (order == IndexOrder.TENANT_CREATED) {
            candidates = rows.stream().filter(row -> operation.kind() == Kind.ALL_RANGE
                    || (row.tenant().equals(operation.tenant()) && inRange(row, operation)))
                    .sorted(TENANT_ORDER).toList();
            path = AccessPath.TENANT_CREATED_INDEX;
        } else {
            candidates = rows.stream().filter(row -> inRange(row, operation)).sorted(CREATED_ORDER).toList();
            path = AccessPath.CREATED_TENANT_INDEX;
        }
        List<Row> matches = candidates.stream().filter(row -> inRange(row, operation)
                && (operation.kind() == Kind.ALL_RANGE || row.tenant().equals(operation.tenant())))
                .sorted(RETURN_ORDER).toList();
        List<String> returned = matches.stream().limit(operation.limit()).map(Row::id).toList();
        int baseRows = order == IndexOrder.NONE ? candidates.size() : matches.size();
        Work work = new Work(0, order == IndexOrder.NONE ? 0 : 1,
                order == IndexOrder.NONE ? 0 : candidates.size(), baseRows, matches.size(), returned.size(), 0, 0, 0, 0);
        String explanation = order == IndexOrder.NONE
                ? "The table scan examined all " + candidates.size() + " base rows."
                : "The " + (order == IndexOrder.TENANT_CREATED ? "tenant-first" : "created-first")
                        + " index examined " + candidates.size() + " entries and fetched " + baseRows
                        + " matching base rows after index-covered filtering.";
        explanation += " It matched " + matches.size() + " rows and returned " + returned.size()
                + "; the result limit applies after this full candidate evaluation.";
        return new Outcome(operation.id(), operation.kind(), path, ids(candidates), ids(matches), returned,
                rows.size(), rows.size(), work, explanation, null, null);
    }

    private static Outcome insert(DataAccessInput input, Operation operation, List<Row> rows,
            Map<String, Row> primary, Map<BusinessKey, Row> business) {
        int before = rows.size();
        Row incoming = operation.row();
        Row conflict = primary.get(incoming.id());
        int checks = 0;
        ConflictReason reason = ConflictReason.DUPLICATE_ID;
        if (conflict == null && input.enforceBusinessKey()) {
            checks = 1;
            conflict = business.get(key(incoming));
            reason = ConflictReason.DUPLICATE_BUSINESS_KEY;
        }
        if (conflict != null) {
            return new Outcome(operation.id(), operation.kind(), AccessPath.INSERT,
                    List.of(), List.of(), List.of(), before, before,
                    new Work(1, 0, 0, 0, 0, 0, 0, 0, checks, 0),
                    "Insert rejected: " + reason + " conflicts with " + conflict.id()
                            + ". No record or index entry was changed.", false, new Conflict(reason, conflict.id()));
        }
        rows.add(incoming);
        primary.put(incoming.id(), incoming);
        if (input.enforceBusinessKey()) business.put(key(incoming), incoming);
        int secondary = input.indexOrder() == IndexOrder.NONE ? 0 : 1;
        int businessWrites = input.enforceBusinessKey() ? 1 : 0;
        return new Outcome(operation.id(), operation.kind(), AccessPath.INSERT,
                List.of(), List.of(), List.of(), before, rows.size(),
                new Work(1, 0, 0, 0, 0, 0, 1, secondary, checks, businessWrites),
                "Insert accepted: one base record, " + secondary + " secondary entry and "
                        + businessWrites + " business-key entry were maintained. These are logical actions, not physical writes.", true, null);
    }
    private static boolean inRange(Row row, Operation operation) {
        return row.createdOrder() >= operation.fromCreatedOrder() && row.createdOrder() <= operation.toCreatedOrder();
    }
    private static List<String> ids(List<Row> rows) { return rows.stream().map(Row::id).toList(); }
    private static BusinessKey key(Row row) { return new BusinessKey(row.tenant(), row.businessKey()); }
    private record BusinessKey(String tenant, String key) {}
}
