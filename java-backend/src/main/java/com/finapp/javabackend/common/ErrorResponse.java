package com.finapp.javabackend.common;

import java.time.Instant;

public record ErrorResponse(
        boolean success,
        int status,
        String error,
        String message,
        String path,
        Instant timestamp
) {
    public static ErrorResponse of(int status, String error, String message, String path) {
        return new ErrorResponse(false, status, error, message, path, Instant.now());
    }
}