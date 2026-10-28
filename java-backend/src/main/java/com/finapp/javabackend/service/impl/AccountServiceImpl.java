package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.AccountDTO;
import com.finapp.javabackend.dto.CreateAccountRequest;
import com.finapp.javabackend.dto.UpdateAccountRequest;
import com.finapp.javabackend.model.entity.Account;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.enums.AccountType;
import com.finapp.javabackend.repository.AccountRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.AccountService;
import com.finapp.javabackend.service.mapper.EntityDtoMapper;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class AccountServiceImpl implements AccountService {

    private final AccountRepository accountRepository;
    private final UserRepository userRepository;

    public AccountServiceImpl(AccountRepository accountRepository, UserRepository userRepository) {
        this.accountRepository = accountRepository;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<AccountDTO> getAccounts(Long userId) {
        return accountRepository.findByUserId(userId).stream()
            .map(EntityDtoMapper::toDto)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public AccountDTO getAccount(Long userId, Long accountId) {
        Account account = accountRepository.findByIdAndUserId(accountId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        return EntityDtoMapper.toDto(account);
    }

    @Override
    public AccountDTO createAccount(Long userId, CreateAccountRequest request) {
        if (request == null || request.name() == null || request.name().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Account name is required");
        }
        String trimmedName = request.name().trim();
        if (accountRepository.existsByUserIdAndName(userId, trimmedName)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Account with name '" + trimmedName + "' already exists");
        }
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Account account = new Account();
        account.setUser(user);
        account.setName(trimmedName);
        account.setType(request.type() != null ? request.type() : AccountType.checking);
        account.setOpeningBalance(request.openingBalance() != null ? request.openingBalance() : BigDecimal.ZERO);
        account.setIsActive(request.isActive() != null ? request.isActive() : Boolean.TRUE);
        account.setCreatedAt(OffsetDateTime.now());
        account.setUpdatedAt(OffsetDateTime.now());

        return EntityDtoMapper.toDto(accountRepository.save(account));
    }

    @Override
    public AccountDTO updateAccount(Long userId, Long accountId, UpdateAccountRequest request) {
        Account account = accountRepository.findByIdAndUserId(accountId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));

        if (request.name() != null && !request.name().trim().isEmpty()) {
            String trimmedName = request.name().trim();
            if (!trimmedName.equalsIgnoreCase(account.getName()) && accountRepository.existsByUserIdAndName(userId, trimmedName)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Account with name '" + trimmedName + "' already exists");
            }
            account.setName(trimmedName);
        }
        if (request.type() != null) {
            account.setType(request.type());
        }
        if (request.openingBalance() != null) {
            account.setOpeningBalance(request.openingBalance());
        }
        if (request.isActive() != null) {
            account.setIsActive(request.isActive());
        }
        account.setUpdatedAt(OffsetDateTime.now());

        return EntityDtoMapper.toDto(accountRepository.save(account));
    }

    @Override
    public void deleteAccount(Long userId, Long accountId) {
        Account account = accountRepository.findByIdAndUserId(accountId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        accountRepository.delete(account);
    }
}

