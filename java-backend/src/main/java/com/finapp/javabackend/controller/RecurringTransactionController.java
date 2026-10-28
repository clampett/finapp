package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.CreateRecurringTransactionRequest;
import com.finapp.javabackend.dto.RecurringTransactionDTO;
import com.finapp.javabackend.dto.TransactionDTO;
import com.finapp.javabackend.dto.UpdateRecurringTransactionRequest;
import com.finapp.javabackend.service.RecurringTransactionService;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/recurring-transactions")
public class RecurringTransactionController {

    private final RecurringTransactionService recurringTransactionService;

    public RecurringTransactionController(RecurringTransactionService recurringTransactionService) {
        this.recurringTransactionService = recurringTransactionService;
    }

    private Long getUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to access recurring transactions.");
        }
        return user.id();
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<RecurringTransactionDTO>>> getRecurringTransactions(Authentication authentication) {
        Long userId = getUserId(authentication);
        List<RecurringTransactionDTO> list = recurringTransactionService.getRecurringTransactions(userId);
        return ResponseEntity.ok(ApiResponse.success(list, "Recurring transactions fetched successfully"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<RecurringTransactionDTO>> getRecurringTransaction(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        RecurringTransactionDTO dto = recurringTransactionService.getRecurringTransaction(userId, id);
        return ResponseEntity.ok(ApiResponse.success(dto, "Recurring transaction fetched successfully"));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<RecurringTransactionDTO>> createRecurringTransaction(
        @RequestBody CreateRecurringTransactionRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        RecurringTransactionDTO created = recurringTransactionService.createRecurringTransaction(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(created, "Recurring transaction created successfully"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<RecurringTransactionDTO>> updateRecurringTransaction(
        @PathVariable Long id,
        @RequestBody UpdateRecurringTransactionRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        RecurringTransactionDTO updated = recurringTransactionService.updateRecurringTransaction(userId, id, request);
        return ResponseEntity.ok(ApiResponse.success(updated, "Recurring transaction updated successfully"));
    }

    @PostMapping("/{id}")
    public ResponseEntity<ApiResponse<RecurringTransactionDTO>> updateRecurringTransactionViaPost(
        @PathVariable Long id,
        @RequestBody UpdateRecurringTransactionRequest request,
        Authentication authentication
    ) {
        return updateRecurringTransaction(id, request, authentication);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteRecurringTransaction(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        recurringTransactionService.deleteRecurringTransaction(userId, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Recurring transaction deleted successfully"));
    }

    @PostMapping("/generate")
    public ResponseEntity<ApiResponse<List<TransactionDTO>>> generateDue(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate throughDate,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        List<TransactionDTO> generated = recurringTransactionService.generateDueTransactions(userId, throughDate);
        return ResponseEntity.ok(ApiResponse.success(generated, "Due occurrences generated successfully"));
    }

    @PostMapping("/{id}/generate")
    public ResponseEntity<ApiResponse<List<TransactionDTO>>> generateForId(
        @PathVariable Long id,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate throughDate,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        List<TransactionDTO> generated = recurringTransactionService.generateForRecurringTransaction(userId, id, throughDate);
        return ResponseEntity.ok(ApiResponse.success(generated, "Occurrences generated successfully"));
    }
}

