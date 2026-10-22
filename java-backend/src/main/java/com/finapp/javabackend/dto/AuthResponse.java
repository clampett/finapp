package com.finapp.javabackend.dto;

public class AuthResponse {

    private String message;
    private Long userId;
    private String sessionToken;

    public AuthResponse(String message, Long userId) {
        this.message = message;
        this.userId = userId;
    }

    // Getters
    public String getMessage() {
        return message;
    }

    public Long getUserId() {
        return userId;
    }

    public String getSessionToken() {
        return sessionToken;
    }

    public AuthResponse withSessionToken(String token) {
        this.sessionToken = token;
        return this;
    }
}
