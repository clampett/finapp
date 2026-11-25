package com.finapp.javabackend.dto;

public record UserProfileDTO(
    Long id,
    String username,
    String email,
    String displayName,
    String profilePicture
) {}
