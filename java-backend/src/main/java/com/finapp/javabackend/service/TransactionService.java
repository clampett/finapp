package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.CreateTransactionRequest;
import com.finapp.javabackend.dto.TransactionDTO;
import com.finapp.javabackend.dto.UpdateTransactionRequest;
import java.time.LocalDate;
import java.util.List;

public interface TransactionService {
    List<TransactionDTO> getTransactions(Long userId, LocalDate startDate, LocalDate endDate, Long accountId, Long categoryId);
    TransactionDTO getTransaction(Long userId, Long transactionId);
    TransactionDTO createTransaction(Long userId, CreateTransactionRequest request);
    TransactionDTO updateTransaction(Long userId, Long transactionId, UpdateTransactionRequest request);
    void deleteTransaction(Long userId, Long transactionId);
}

