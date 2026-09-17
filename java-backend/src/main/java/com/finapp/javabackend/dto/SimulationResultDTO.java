package com.finapp.javabackend.dto;

import java.math.BigDecimal;

public record SimulationResultDTO(
        BigDecimal p10NetWorth,
        BigDecimal p50NetWorth,
        BigDecimal p90NetWorth,
        String aiRecommendation
) {}