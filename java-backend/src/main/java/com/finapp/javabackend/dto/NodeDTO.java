package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.entity.NodeType;
import java.math.BigDecimal;

public record NodeDTO(
        Long id,
        String name,
        NodeType type,
        BigDecimal currentBalance,
        BigDecimal interestRateApr
) {}