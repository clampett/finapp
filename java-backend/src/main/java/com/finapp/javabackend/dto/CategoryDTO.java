package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.TransactionKind;
import java.time.OffsetDateTime;

public record CategoryDTO(
    Long id,
    Long userId,
    String name,
    TransactionKind kind,
    Long parentId,
    String parentName,
    OffsetDateTime createdAt
) {}

