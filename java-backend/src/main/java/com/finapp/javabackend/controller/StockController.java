package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.CreateStockRequest;
import com.finapp.javabackend.dto.StockDTO;
import com.finapp.javabackend.dto.UpdateStockRequest;
import com.finapp.javabackend.service.StockService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/stocks")
public class StockController {

    private final StockService stockService;

    public StockController(StockService stockService) {
        this.stockService = stockService;
    }

    private Long getUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to access stocks.");
        }
        return user.id();
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<StockDTO>>> getStocks(Authentication authentication) {
        Long userId = getUserId(authentication);
        List<StockDTO> list = stockService.getStocks(userId);
        return ResponseEntity.ok(ApiResponse.success(list, "Stocks fetched successfully"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<StockDTO>> getStock(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        StockDTO dto = stockService.getStock(userId, id);
        return ResponseEntity.ok(ApiResponse.success(dto, "Stock fetched successfully"));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<StockDTO>> createStock(
        @RequestBody CreateStockRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        StockDTO created = stockService.createStock(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(created, "Stock created successfully"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<StockDTO>> updateStock(
        @PathVariable Long id,
        @RequestBody UpdateStockRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        StockDTO updated = stockService.updateStock(userId, id, request);
        return ResponseEntity.ok(ApiResponse.success(updated, "Stock updated successfully"));
    }

    @PostMapping("/{id}")
    public ResponseEntity<ApiResponse<StockDTO>> updateStockViaPost(
        @PathVariable Long id,
        @RequestBody UpdateStockRequest request,
        Authentication authentication
    ) {
        return updateStock(id, request, authentication);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteStock(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        stockService.deleteStock(userId, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Stock deleted successfully"));
    }
}

