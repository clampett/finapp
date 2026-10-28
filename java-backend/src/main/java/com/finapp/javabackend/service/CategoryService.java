package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.CategoryDTO;
import com.finapp.javabackend.dto.CreateCategoryRequest;
import com.finapp.javabackend.dto.UpdateCategoryRequest;
import com.finapp.javabackend.model.enums.TransactionKind;
import java.util.List;

public interface CategoryService {
    List<CategoryDTO> getCategories(Long userId, TransactionKind kind);
    CategoryDTO getCategory(Long userId, Long categoryId);
    CategoryDTO createCategory(Long userId, CreateCategoryRequest request);
    CategoryDTO updateCategory(Long userId, Long categoryId, UpdateCategoryRequest request);
    void deleteCategory(Long userId, Long categoryId);
}

