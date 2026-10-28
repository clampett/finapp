package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.CategoryDTO;
import com.finapp.javabackend.dto.CreateCategoryRequest;
import com.finapp.javabackend.dto.UpdateCategoryRequest;
import com.finapp.javabackend.model.entity.Category;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.enums.TransactionKind;
import com.finapp.javabackend.repository.CategoryRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.CategoryService;
import com.finapp.javabackend.service.mapper.EntityDtoMapper;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class CategoryServiceImpl implements CategoryService {

    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;

    public CategoryServiceImpl(CategoryRepository categoryRepository, UserRepository userRepository) {
        this.categoryRepository = categoryRepository;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CategoryDTO> getCategories(Long userId, TransactionKind kind) {
        List<Category> categories = kind != null
            ? categoryRepository.findByUserIdAndKind(userId, kind)
            : categoryRepository.findByUserId(userId);
        return categories.stream().map(EntityDtoMapper::toDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public CategoryDTO getCategory(Long userId, Long categoryId) {
        Category category = categoryRepository.findByIdAndUserId(categoryId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
        return EntityDtoMapper.toDto(category);
    }

    @Override
    public CategoryDTO createCategory(Long userId, CreateCategoryRequest request) {
        if (request == null || request.name() == null || request.name().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category name is required");
        }
        if (request.kind() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category kind (income/expense) is required");
        }
        String trimmedName = request.name().trim();
        if (categoryRepository.existsByUserIdAndKindAndName(userId, request.kind(), trimmedName)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Category '" + trimmedName + "' already exists for kind " + request.kind());
        }

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Category parent = null;
        if (request.parentId() != null) {
            parent = categoryRepository.findByIdAndUserId(request.parentId(), userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parent category not found"));
            if (parent.getKind() != request.kind()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parent category kind must match child category kind");
            }
        }

        Category category = new Category();
        category.setUser(user);
        category.setName(trimmedName);
        category.setKind(request.kind());
        category.setParent(parent);
        category.setCreatedAt(OffsetDateTime.now());

        return EntityDtoMapper.toDto(categoryRepository.save(category));
    }

    @Override
    public CategoryDTO updateCategory(Long userId, Long categoryId, UpdateCategoryRequest request) {
        Category category = categoryRepository.findByIdAndUserId(categoryId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));

        if (request.name() != null && !request.name().trim().isEmpty()) {
            String trimmedName = request.name().trim();
            if (!trimmedName.equalsIgnoreCase(category.getName()) &&
                categoryRepository.existsByUserIdAndKindAndName(userId, category.getKind(), trimmedName)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Category '" + trimmedName + "' already exists for kind " + category.getKind());
            }
            category.setName(trimmedName);
        }

        if (request.parentId() != null) {
            if (request.parentId().equals(categoryId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category cannot be its own parent");
            }
            Category parent = categoryRepository.findByIdAndUserId(request.parentId(), userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parent category not found"));
            if (parent.getKind() != category.getKind()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parent category kind must match child category kind");
            }
            // Check cycle
            Category current = parent;
            Set<Long> visited = new HashSet<>();
            visited.add(categoryId);
            while (current != null) {
                if (!visited.add(current.getId())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cycle detected in category hierarchy");
                }
                current = current.getParent();
            }
            category.setParent(parent);
        }

        return EntityDtoMapper.toDto(categoryRepository.save(category));
    }

    @Override
    public void deleteCategory(Long userId, Long categoryId) {
        Category category = categoryRepository.findByIdAndUserId(categoryId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
        categoryRepository.delete(category);
    }
}

