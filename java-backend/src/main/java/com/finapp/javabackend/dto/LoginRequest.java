package com.finapp.javabackend.dto;

public record LoginRequest(
        String username,
        String password
) {}