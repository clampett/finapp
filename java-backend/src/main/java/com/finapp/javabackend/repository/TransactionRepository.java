package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.Transaction;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {
    List<Transaction> findByUserId(Long userId);
    List<Transaction> findByUserIdAndTransactionDateBetween(Long userId, LocalDate start, LocalDate end);
}
