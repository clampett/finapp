package com.finapp.javabackend.dto;

import java.math.BigDecimal;

public record EdgeDTO(
        Long id,
        Long sourceNodeId,
        Long targetNodeId,
        BigDecimal monthlyFixedFlow,
        BigDecimal percentageFlow
) {}