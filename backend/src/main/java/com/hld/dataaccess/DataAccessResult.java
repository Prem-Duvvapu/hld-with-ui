package com.hld.dataaccess;

import com.hld.dataaccess.DataAccessInput.Kind;
import com.hld.dataaccess.DataAccessInput.Row;
import java.util.List;

/** Authoritative counts of logical access work, not a measured database benchmark. */
public record DataAccessResult(
        String simulationId, String schemaVersion, String modelVersion, String kind, String status,
        DataAccessInput input, List<Outcome> outcomes, List<Row> finalRows, Work totals,
        List<String> assumptions) {
    public DataAccessResult {
        outcomes = List.copyOf(outcomes);
        finalRows = List.copyOf(finalRows);
        assumptions = List.copyOf(assumptions);
    }
    public enum AccessPath { PRIMARY_KEY, TABLE_SCAN, TENANT_CREATED_INDEX, CREATED_TENANT_INDEX, INSERT }
    public enum ConflictReason { DUPLICATE_ID, DUPLICATE_BUSINESS_KEY }
    public record Conflict(ConflictReason reason, String recordId) {}
    public record Outcome(
            String operationId, Kind kind, AccessPath accessPath, List<String> candidateIds,
            List<String> matchedIds, List<String> returnedIds, int recordCountBefore,
            int recordCountAfter, Work work, String explanation, Boolean accepted, Conflict conflict) {
        public Outcome {
            candidateIds = List.copyOf(candidateIds);
            matchedIds = List.copyOf(matchedIds);
            returnedIds = List.copyOf(returnedIds);
        }
    }
    public record Work(
            int primaryKeyLookups, int indexSeeks, int indexEntriesExamined, int baseRowsExamined,
            int matchedRows, int returnedRows, int baseWrites, int secondaryIndexWrites,
            int businessKeyChecks, int businessKeyWrites) {
        public static final Work ZERO = new Work(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        public Work plus(Work other) {
            return new Work(primaryKeyLookups + other.primaryKeyLookups, indexSeeks + other.indexSeeks,
                    indexEntriesExamined + other.indexEntriesExamined, baseRowsExamined + other.baseRowsExamined,
                    matchedRows + other.matchedRows, returnedRows + other.returnedRows,
                    baseWrites + other.baseWrites, secondaryIndexWrites + other.secondaryIndexWrites,
                    businessKeyChecks + other.businessKeyChecks, businessKeyWrites + other.businessKeyWrites);
        }
    }
}
