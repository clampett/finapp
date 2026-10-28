package com.finapp.javabackend.dto;

public record UpdateCategoryRequest(
    String name,
    Long parentId
) {}

