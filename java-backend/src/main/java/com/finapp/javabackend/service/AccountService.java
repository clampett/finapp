package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.AccountDTO;
import com.finapp.javabackend.dto.CreateAccountRequest;
import com.finapp.javabackend.dto.UpdateAccountRequest;
import java.util.List;

public interface AccountService {
    List<AccountDTO> getAccounts(Long userId);
    AccountDTO getAccount(Long userId, Long accountId);
    AccountDTO createAccount(Long userId, CreateAccountRequest request);
    AccountDTO updateAccount(Long userId, Long accountId, UpdateAccountRequest request);
    void deleteAccount(Long userId, Long accountId);
}

