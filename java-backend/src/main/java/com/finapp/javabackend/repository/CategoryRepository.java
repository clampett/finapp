package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.Category;
import com.finapp.javabackend.model.enums.TransactionKind;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<Category, Long> {
    List<Category> findByUserId(Long userId);
    List<Category> findByUserIdAndKind(Long userId, TransactionKind kind);
    Optional<Category> findByIdAndUserId(Long id, Long userId);
    Optional<Category> findByUserIdAndKindAndName(Long userId, TransactionKind kind, String name);
    boolean existsByUserIdAndKindAndName(Long userId, TransactionKind kind, String name);
}
