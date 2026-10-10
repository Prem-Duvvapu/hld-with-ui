package com.hld.api;

import org.springframework.http.HttpStatus;

final class HttpResourceException extends RuntimeException {
    private final String code;
    private final HttpStatus status;

    HttpResourceException(String code, HttpStatus status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    String code() { return code; }
    HttpStatus status() { return status; }
}
