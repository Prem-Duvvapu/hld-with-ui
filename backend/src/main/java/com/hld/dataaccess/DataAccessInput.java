package com.hld.dataaccess;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** A finite access-pattern analysis; ordering keys are not elapsed time. */
public record DataAccessInput(
        String schemaVersion,
        String modelVersion,
        IndexOrder indexOrder,
        Boolean enforceBusinessKey,
        List<Row> rows,
        List<Operation> operations) {
    public static final String SCHEMA_VERSION = "1.0";
    public static final String MODEL_VERSION = "1.0.0";
    public static final String ID_PATTERN = "[a-z][a-z0-9-]{0,31}";
    public static final int MAX_INITIAL_ROWS = 20;
    public static final int MAX_OPERATIONS = 10;
    public static final int MAX_CREATED_ORDER = 1_000_000;
    public static final int MAX_QUERY_LIMIT = 20;
    public static final int MAX_RESULT_ROWS = MAX_INITIAL_ROWS + MAX_OPERATIONS;

    public DataAccessInput {
        rows = own(rows);
        operations = own(operations);
    }

    private static <T> List<T> own(List<T> values) {
        return values == null ? null : Collections.unmodifiableList(new ArrayList<>(values));
    }

    public enum IndexOrder { NONE, TENANT_CREATED, CREATED_TENANT }
    public enum Kind { LOOKUP_ID, TENANT_RANGE, ALL_RANGE, INSERT }
    public record Row(String id, String tenant, String businessKey, Integer createdOrder) {}

    /** Nullable fields belong to exactly one closed variant; validation rejects mixed variants. */
    public record Operation(
            String id,
            Kind kind,
            String rowId,
            String tenant,
            Integer fromCreatedOrder,
            Integer toCreatedOrder,
            Integer limit,
            Row row) {
        public static Operation lookup(String id, String rowId) {
            return new Operation(id, Kind.LOOKUP_ID, rowId, null, null, null, null, null);
        }
        public static Operation tenantRange(String id, String tenant, int from, int to, int limit) {
            return new Operation(id, Kind.TENANT_RANGE, null, tenant, from, to, limit, null);
        }
        public static Operation allRange(String id, int from, int to, int limit) {
            return new Operation(id, Kind.ALL_RANGE, null, null, from, to, limit, null);
        }
        public static Operation insert(String id, Row row) {
            return new Operation(id, Kind.INSERT, null, null, null, null, null, row);
        }
    }
}
