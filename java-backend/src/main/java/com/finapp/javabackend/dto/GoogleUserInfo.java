package com.finapp.javabackend.dto;

public record GoogleUserInfo(
    String email,
    boolean emailVerified,
    String name,
    String pictureUrl
) {}
