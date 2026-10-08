package com.finapp.javabackend.dto;

public record LoginResponse(
        Long id,
        String username,
        String email
) {}
