package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.Transaction;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {
    List<Transaction> findByUserId(Long userId);
    List<Transaction> findByUserIdOrderByTransactionDateDesc(Long userId);
    List<Transaction> findByUserIdAndTransactionDateBetweenOrderByTransactionDateDesc(Long userId, LocalDate start, LocalDate end);
    Optional<Transaction> findByIdAndUserId(Long id, Long userId);
    boolean existsByRecurringTransactionIdAndTransactionDate(Long recurringTransactionId, LocalDate transactionDate);
}
