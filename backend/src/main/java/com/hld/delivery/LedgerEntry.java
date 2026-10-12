package com.hld.delivery;

/** One durable modeled append; lease expiry or consumer failure cannot undo this record. */
public record LedgerEntry(
        String id, String messageId, String attemptId, String consumerId, long committedAtMs) {}
