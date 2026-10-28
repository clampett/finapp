package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.AccountDTO;
import com.finapp.javabackend.dto.CreateAccountRequest;
import com.finapp.javabackend.dto.UpdateAccountRequest;
import com.finapp.javabackend.service.AccountService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/accounts")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    private Long getUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to access accounts.");
        }
        return user.id();
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<AccountDTO>>> getAccounts(Authentication authentication) {
        Long userId = getUserId(authentication);
        List<AccountDTO> accounts = accountService.getAccounts(userId);
        return ResponseEntity.ok(ApiResponse.success(accounts, "Accounts fetched successfully"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<AccountDTO>> getAccount(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        AccountDTO account = accountService.getAccount(userId, id);
        return ResponseEntity.ok(ApiResponse.success(account, "Account fetched successfully"));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<AccountDTO>> createAccount(
        @RequestBody CreateAccountRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        AccountDTO created = accountService.createAccount(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(created, "Account created successfully"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<AccountDTO>> updateAccount(
        @PathVariable Long id,
        @RequestBody UpdateAccountRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        AccountDTO updated = accountService.updateAccount(userId, id, request);
        return ResponseEntity.ok(ApiResponse.success(updated, "Account updated successfully"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteAccount(
        @PathVariable Long id,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        accountService.deleteAccount(userId, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Account deleted successfully"));
    }
}

