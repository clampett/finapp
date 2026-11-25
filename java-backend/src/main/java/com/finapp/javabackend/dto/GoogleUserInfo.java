package com.finapp.javabackend.dto;

public record GoogleUserInfo(
    String subject,
    String email,
    boolean emailVerified,
    String name,
    String pictureUrl,
    String hostedDomain
) {}
