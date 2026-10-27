package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.RecurringTransaction;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecurringTransactionRepository extends JpaRepository<RecurringTransaction, Long> {
    List<RecurringTransaction> findByUserId(Long userId);
    List<RecurringTransaction> findByUserIdAndIsActiveTrueAndNextDueDateLessThanEqual(Long userId, LocalDate date);
}
