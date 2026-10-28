package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.TransactionKind;

public record CreateCategoryRequest(
    String name,
    TransactionKind kind,
    Long parentId
) {}

