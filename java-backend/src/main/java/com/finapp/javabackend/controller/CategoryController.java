package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.CategoryDTO;
import com.finapp.javabackend.dto.CreateCategoryRequest;
import com.finapp.javabackend.dto.UpdateCategoryRequest;
import com.finapp.javabackend.model.enums.TransactionKind;
import com.finapp.javabackend.service.CategoryService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    private Long getUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to access categories.");
        }
        return user.id();
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<CategoryDTO>>> getCategories(
        @RequestParam(required = false) TransactionKind kind,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        List<CategoryDTO> categories = categoryService.getCategories(userId, kind);
        return ResponseEntity.ok(ApiResponse.success(categories, "Categories fetched successfully"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<CategoryDTO>> getCategory(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        CategoryDTO category = categoryService.getCategory(userId, id);
        return ResponseEntity.ok(ApiResponse.success(category, "Category fetched successfully"));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CategoryDTO>> createCategory(
        @RequestBody CreateCategoryRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        CategoryDTO created = categoryService.createCategory(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(created, "Category created successfully"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CategoryDTO>> updateCategory(
        @PathVariable Long id,
        @RequestBody UpdateCategoryRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        CategoryDTO updated = categoryService.updateCategory(userId, id, request);
        return ResponseEntity.ok(ApiResponse.success(updated, "Category updated successfully"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCategory(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        categoryService.deleteCategory(userId, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Category deleted successfully"));
    }
}

