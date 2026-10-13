package com.hld.dataaccess;

public record DataAccessLimits(int maxInitialRows, int maxOperations, int maxCreatedOrder,
        int maxResultRows, int maxQueryLimit, int maxIdLength) {
    public static final DataAccessLimits CURRENT = new DataAccessLimits(
            DataAccessInput.MAX_INITIAL_ROWS, DataAccessInput.MAX_OPERATIONS,
            DataAccessInput.MAX_CREATED_ORDER, DataAccessInput.MAX_RESULT_ROWS,
            DataAccessInput.MAX_QUERY_LIMIT, 32);
}
