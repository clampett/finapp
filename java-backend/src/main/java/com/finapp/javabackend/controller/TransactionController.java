package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.CreateTransactionRequest;
import com.finapp.javabackend.dto.TransactionDTO;
import com.finapp.javabackend.dto.UpdateTransactionRequest;
import com.finapp.javabackend.service.TransactionService;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/transactions")
public class TransactionController {

    private final TransactionService transactionService;

    public TransactionController(TransactionService transactionService) {
        this.transactionService = transactionService;
    }

    private Long getUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to access transactions.");
        }
        return user.id();
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<TransactionDTO>>> getTransactions(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        @RequestParam(required = false) Long accountId,
        @RequestParam(required = false) Long categoryId,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        List<TransactionDTO> list = transactionService.getTransactions(userId, startDate, endDate, accountId, categoryId);
        return ResponseEntity.ok(ApiResponse.success(list, "Transactions fetched successfully"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TransactionDTO>> getTransaction(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        TransactionDTO dto = transactionService.getTransaction(userId, id);
        return ResponseEntity.ok(ApiResponse.success(dto, "Transaction fetched successfully"));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<TransactionDTO>> createTransaction(
        @RequestBody CreateTransactionRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        TransactionDTO created = transactionService.createTransaction(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(created, "Transaction created successfully"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<TransactionDTO>> updateTransaction(
        @PathVariable Long id,
        @RequestBody UpdateTransactionRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        TransactionDTO updated = transactionService.updateTransaction(userId, id, request);
        return ResponseEntity.ok(ApiResponse.success(updated, "Transaction updated successfully"));
    }

    // Support POST /{id} for clients that post edits
    @PostMapping("/{id}")
    public ResponseEntity<ApiResponse<TransactionDTO>> updateTransactionViaPost(
        @PathVariable Long id,
        @RequestBody UpdateTransactionRequest request,
        Authentication authentication
    ) {
        return updateTransaction(id, request, authentication);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteTransaction(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        transactionService.deleteTransaction(userId, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Transaction deleted successfully"));
    }
}

