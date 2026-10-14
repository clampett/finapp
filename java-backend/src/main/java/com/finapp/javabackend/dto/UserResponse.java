package com.finapp.javabackend.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record UserResponse(
        Long id,
        String username,
        String email,
        LocalDateTime createdAt,
        BigDecimal netWorth
) {}