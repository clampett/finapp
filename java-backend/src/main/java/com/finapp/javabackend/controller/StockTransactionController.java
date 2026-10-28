package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.CreateStockTransactionRequest;
import com.finapp.javabackend.dto.StockTransactionDTO;
import com.finapp.javabackend.service.StockTransactionService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/stock-transactions")
public class StockTransactionController {

    private final StockTransactionService stockTransactionService;

    public StockTransactionController(StockTransactionService stockTransactionService) {
        this.stockTransactionService = stockTransactionService;
    }

    private Long getUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to access stock transactions.");
        }
        return user.id();
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<StockTransactionDTO>>> getStockTransactions(
        @RequestParam(required = false) Long stockId,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        List<StockTransactionDTO> list = stockTransactionService.getStockTransactions(userId, stockId);
        return ResponseEntity.ok(ApiResponse.success(list, "Stock transactions fetched successfully"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<StockTransactionDTO>> getStockTransaction(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        StockTransactionDTO dto = stockTransactionService.getStockTransaction(userId, id);
        return ResponseEntity.ok(ApiResponse.success(dto, "Stock transaction fetched successfully"));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<StockTransactionDTO>> createStockTransaction(
        @RequestBody CreateStockTransactionRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        StockTransactionDTO created = stockTransactionService.createStockTransaction(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(created, "Stock transaction recorded successfully"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteStockTransaction(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        stockTransactionService.deleteStockTransaction(userId, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Stock transaction deleted successfully"));
    }
}

