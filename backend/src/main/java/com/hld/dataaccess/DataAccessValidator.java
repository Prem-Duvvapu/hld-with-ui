package com.hld.dataaccess;

import com.hld.dataaccess.DataAccessInput.Operation;
import com.hld.dataaccess.DataAccessInput.Row;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** Domain validation also protects callers that do not enter through HTTP. */
public final class DataAccessValidator {
    private static final Pattern ID = Pattern.compile(DataAccessInput.ID_PATTERN);
    private DataAccessValidator() {}

    public static void validate(DataAccessInput input) {
        require(input != null, "input is required");
        require(DataAccessInput.SCHEMA_VERSION.equals(input.schemaVersion()), "schemaVersion must be 1.0");
        require(DataAccessInput.MODEL_VERSION.equals(input.modelVersion()), "modelVersion must be 1.0.0");
        require(input.indexOrder() != null, "indexOrder is required");
        require(input.enforceBusinessKey() != null, "enforceBusinessKey is required");
        size(input.rows(), 0, DataAccessInput.MAX_INITIAL_ROWS, "rows");
        size(input.operations(), 1, DataAccessInput.MAX_OPERATIONS, "operations");
        Set<String> primary = new HashSet<>();
        Set<BusinessKey> business = new HashSet<>();
        for (Row row : input.rows()) {
            row(row);
            require(primary.add(row.id()), "initial row IDs must be unique");
            require(!input.enforceBusinessKey() || business.add(new BusinessKey(row.tenant(), row.businessKey())),
                    "initial tenant/businessKey pairs must be unique when enforcement is enabled");
        }
        Set<String> operations = new HashSet<>();
        for (Operation operation : input.operations()) {
            require(operation != null, "operations must not contain null");
            identity(operation.id(), "operation ID");
            require(operations.add(operation.id()), "operation IDs must be unique");
            require(operation.kind() != null, "operation kind is required");
            switch (operation.kind()) {
                case LOOKUP_ID -> {
                    identity(operation.rowId(), "rowId");
                    require(operation.tenant() == null && operation.fromCreatedOrder() == null
                            && operation.toCreatedOrder() == null && operation.limit() == null
                            && operation.row() == null, "LOOKUP_ID contains fields from another variant");
                }
                case TENANT_RANGE, ALL_RANGE -> {
                    require(operation.rowId() == null && operation.row() == null,
                            "range operation contains fields from another variant");
                    if (operation.kind() == DataAccessInput.Kind.TENANT_RANGE) identity(operation.tenant(), "tenant");
                    else require(operation.tenant() == null, "ALL_RANGE must not contain tenant");
                    range(operation.fromCreatedOrder(), 0, DataAccessInput.MAX_CREATED_ORDER, "fromCreatedOrder");
                    range(operation.toCreatedOrder(), 0, DataAccessInput.MAX_CREATED_ORDER, "toCreatedOrder");
                    require(operation.fromCreatedOrder() <= operation.toCreatedOrder(), "range start must not exceed end");
                    range(operation.limit(), 1, DataAccessInput.MAX_QUERY_LIMIT, "limit");
                }
                case INSERT -> {
                    require(operation.rowId() == null && operation.tenant() == null
                            && operation.fromCreatedOrder() == null && operation.toCreatedOrder() == null
                            && operation.limit() == null, "INSERT contains fields from another variant");
                    row(operation.row());
                }
            }
        }
    }

    private static void row(Row row) {
        require(row != null, "row is required");
        identity(row.id(), "row ID");
        identity(row.tenant(), "row tenant");
        identity(row.businessKey(), "row businessKey");
        range(row.createdOrder(), 0, DataAccessInput.MAX_CREATED_ORDER, "createdOrder");
    }
    private static void identity(String id, String label) {
        require(id != null && ID.matcher(id).matches(), label + " must be a lowercase ASCII identifier of 1–32 characters");
    }
    private static void range(Integer value, int minimum, int maximum, String label) {
        require(value != null && value >= minimum && value <= maximum, label + " must be between " + minimum + " and " + maximum);
    }
    private static void size(List<?> values, int min, int max, String label) {
        require(values != null && values.size() >= min && values.size() <= max, label + " must contain " + min + "–" + max + " entries");
    }
    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }
    private record BusinessKey(String tenant, String key) {}
}
