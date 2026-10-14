package com.finapp.javabackend.dto;

public record RegistrationRequest(
        String username,
        String email,
        String password
) {}