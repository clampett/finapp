package com.finapp.javabackend.dto;

public record GoogleAuthResult(
    Long userId,
    String sessionToken
) {}
