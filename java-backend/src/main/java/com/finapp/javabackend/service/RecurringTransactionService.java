package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.CreateRecurringTransactionRequest;
import com.finapp.javabackend.dto.RecurringTransactionDTO;
import com.finapp.javabackend.dto.TransactionDTO;
import com.finapp.javabackend.dto.UpdateRecurringTransactionRequest;
import java.time.LocalDate;
import java.util.List;

public interface RecurringTransactionService {
    List<RecurringTransactionDTO> getRecurringTransactions(Long userId);
    RecurringTransactionDTO getRecurringTransaction(Long userId, Long id);
    RecurringTransactionDTO createRecurringTransaction(Long userId, CreateRecurringTransactionRequest request);
    RecurringTransactionDTO updateRecurringTransaction(Long userId, Long id, UpdateRecurringTransactionRequest request);
    void deleteRecurringTransaction(Long userId, Long id);
    List<TransactionDTO> generateDueTransactions(Long userId, LocalDate throughDate);
    List<TransactionDTO> generateForRecurringTransaction(Long userId, Long recurringId, LocalDate throughDate);
}

