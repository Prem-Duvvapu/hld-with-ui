package com.hld.dataaccess;

import com.hld.dataaccess.DataAccessDescriptor.Preset;
import com.hld.dataaccess.DataAccessInput.IndexOrder;
import com.hld.dataaccess.DataAccessInput.Operation;
import com.hld.dataaccess.DataAccessInput.Row;
import java.util.ArrayList;
import java.util.List;

/** Authored finite inputs; expected outcomes live in semantic tests, not descriptor calculations. */
public final class DataAccessPresets {
    private DataAccessPresets() {}
    public static List<Row> rows() {
        List<Row> rows = new ArrayList<>();
        for (String tenant : List.of("alpha", "beta", "gamma")) {
            for (int n = 1; n <= 4; n++) rows.add(new Row(tenant.substring(0, 1) + n, tenant, "k" + n, n * 10));
        }
        return List.copyOf(rows);
    }
    public static DataAccessInput baseline() {
        return input(IndexOrder.TENANT_CREATED, true, List.of(query()));
    }
    public static List<Preset> all() {
        return List.of(
                new Preset("baseline", "Tenant-first lookup", "How much work finds beta's records from 20 through 30?", baseline()),
                new Preset("table-scan", "Remove the secondary index", "Do the answers change, or only the access work?", input(IndexOrder.NONE, true, List.of(query()))),
                new Preset("time-first", "Created order first", "Which other tenants share the candidate created-order interval?", input(IndexOrder.CREATED_TENANT, true, List.of(query()))),
                new Preset("global-range", "Range across every tenant", "Can a tenant-first index narrow this range without a tenant constraint?", input(IndexOrder.TENANT_CREATED, true, List.of(Operation.allRange("q1", 20, 30, 20)))),
                new Preset("duplicate-key", "Reject a duplicate business key", "Does a new primary ID make the same tenant/business key valid?", input(IndexOrder.TENANT_CREATED, true, List.of(Operation.insert("op1", new Row("b5", "beta", "k2", 25)), query()))),
                new Preset("no-unique", "Remove business-key enforcement", "Which business promise disappears while primary IDs remain unique?", input(IndexOrder.TENANT_CREATED, false, List.of(Operation.insert("op1", new Row("b5", "beta", "k2", 25)), query()))),
                new Preset("insert-order", "Insert a new business key", "Which access structures change, and where does the new row appear?", input(IndexOrder.TENANT_CREATED, true, List.of(Operation.insert("op1", new Row("b5", "beta", "k5", 25)), query()))));
    }
    private static Operation query() { return Operation.tenantRange("q1", "beta", 20, 30, 20); }
    private static DataAccessInput input(IndexOrder index, boolean enforce, List<Operation> operations) {
        return new DataAccessInput(DataAccessInput.SCHEMA_VERSION, DataAccessInput.MODEL_VERSION,
                index, enforce, rows(), operations);
    }
}
