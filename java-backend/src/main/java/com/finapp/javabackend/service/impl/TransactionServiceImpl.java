package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.CreateTransactionRequest;
import com.finapp.javabackend.dto.TransactionDTO;
import com.finapp.javabackend.dto.UpdateTransactionRequest;
import com.finapp.javabackend.model.entity.*;
import com.finapp.javabackend.model.enums.AccountType;
import com.finapp.javabackend.model.enums.TransactionKind;
import com.finapp.javabackend.repository.*;
import com.finapp.javabackend.service.TransactionService;
import com.finapp.javabackend.service.mapper.EntityDtoMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class TransactionServiceImpl implements TransactionService {

    private final TransactionRepository transactionRepository;
    private final AccountRepository accountRepository;
    private final CategoryRepository categoryRepository;
    private final RecurringTransactionRepository recurringTransactionRepository;
    private final UserRepository userRepository;

    public TransactionServiceImpl(
        TransactionRepository transactionRepository,
        AccountRepository accountRepository,
        CategoryRepository categoryRepository,
        RecurringTransactionRepository recurringTransactionRepository,
        UserRepository userRepository
    ) {
        this.transactionRepository = transactionRepository;
        this.accountRepository = accountRepository;
        this.categoryRepository = categoryRepository;
        this.recurringTransactionRepository = recurringTransactionRepository;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<TransactionDTO> getTransactions(
        Long userId,
        LocalDate startDate,
        LocalDate endDate,
        Long accountId,
        Long categoryId
    ) {
        List<Transaction> list;
        if (startDate != null && endDate != null) {
            list = transactionRepository.findByUserIdAndTransactionDateBetweenOrderByTransactionDateDesc(userId, startDate, endDate);
        } else {
            list = transactionRepository.findByUserIdOrderByTransactionDateDesc(userId);
        }

        return list.stream()
            .filter(t -> accountId == null || (t.getAccount() != null && t.getAccount().getId().equals(accountId)))
            .filter(t -> categoryId == null || (t.getCategory() != null && t.getCategory().getId().equals(categoryId)))
            .map(EntityDtoMapper::toDto)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public TransactionDTO getTransaction(Long userId, Long transactionId) {
        Transaction transaction = transactionRepository.findByIdAndUserId(transactionId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction not found"));
        return EntityDtoMapper.toDto(transaction);
    }

    @Override
    public TransactionDTO createTransaction(Long userId, CreateTransactionRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transaction request cannot be empty");
        }
        if (request.kind() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transaction kind is required (income/expense)");
        }
        if (request.amount() == null || request.amount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transaction amount must be strictly greater than 0");
        }
        if (request.description() == null || request.description().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transaction description is required");
        }

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Account account = resolveAccount(userId, user, request.accountId(), request.accountName());
        Category category = resolveCategory(userId, user, request.categoryId(), request.categoryName(), request.kind());

        RecurringTransaction recurring = null;
        if (request.recurringTransactionId() != null) {
            recurring = recurringTransactionRepository.findByIdAndUserId(request.recurringTransactionId(), userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recurring transaction template not found"));
        }

        Transaction transaction = new Transaction();
        transaction.setUser(user);
        transaction.setAccount(account);
        transaction.setCategory(category);
        transaction.setRecurringTransaction(recurring);
        transaction.setKind(request.kind());
        transaction.setDescription(request.description().trim());
        transaction.setAmount(request.amount());
        transaction.setTransactionDate(request.effectiveDate());
        transaction.setNotes(request.notes());
        transaction.setCreatedAt(OffsetDateTime.now());
        transaction.setUpdatedAt(OffsetDateTime.now());

        return EntityDtoMapper.toDto(transactionRepository.save(transaction));
    }

    @Override
    public TransactionDTO updateTransaction(Long userId, Long transactionId, UpdateTransactionRequest request) {
        Transaction transaction = transactionRepository.findByIdAndUserId(transactionId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction not found"));

        if (request.kind() != null) {
            transaction.setKind(request.kind());
        }
        if (request.amount() != null) {
            if (request.amount().compareTo(BigDecimal.ZERO) <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transaction amount must be greater than 0");
            }
            transaction.setAmount(request.amount());
        }
        if (request.description() != null && !request.description().trim().isEmpty()) {
            transaction.setDescription(request.description().trim());
        }
        if (request.effectiveDate() != null) {
            transaction.setTransactionDate(request.effectiveDate());
        }
        if (request.notes() != null) {
            transaction.setNotes(request.notes());
        }

        if (request.accountId() != null || (request.accountName() != null && !request.accountName().trim().isEmpty())) {
            transaction.setAccount(resolveAccount(userId, transaction.getUser(), request.accountId(), request.accountName()));
        }

        if (request.categoryId() != null || (request.categoryName() != null && !request.categoryName().trim().isEmpty())) {
            transaction.setCategory(resolveCategory(userId, transaction.getUser(), request.categoryId(), request.categoryName(), transaction.getKind()));
        }

        if (request.recurringTransactionId() != null) {
            RecurringTransaction recurring = recurringTransactionRepository.findByIdAndUserId(request.recurringTransactionId(), userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recurring transaction template not found"));
            transaction.setRecurringTransaction(recurring);
        }

        transaction.setUpdatedAt(OffsetDateTime.now());
        return EntityDtoMapper.toDto(transactionRepository.save(transaction));
    }

    @Override
    public void deleteTransaction(Long userId, Long transactionId) {
        Transaction transaction = transactionRepository.findByIdAndUserId(transactionId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction not found"));
        transactionRepository.delete(transaction);
    }

    private Account resolveAccount(Long userId, User user, Long accountId, String accountName) {
        if (accountId != null) {
            return accountRepository.findByIdAndUserId(accountId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Account not found for user"));
        }
        if (accountName != null && !accountName.trim().isEmpty()) {
            String name = accountName.trim();
            return accountRepository.findByUserIdAndName(userId, name).orElseGet(() -> {
                Account created = new Account();
                created.setUser(user);
                created.setName(name);
                created.setType(AccountType.checking);
                created.setOpeningBalance(BigDecimal.ZERO);
                created.setIsActive(true);
                created.setCreatedAt(OffsetDateTime.now());
                created.setUpdatedAt(OffsetDateTime.now());
                return accountRepository.save(created);
            });
        }
        return null;
    }

    private Category resolveCategory(Long userId, User user, Long categoryId, String categoryName, TransactionKind kind) {
        if (categoryId != null) {
            Category cat = categoryRepository.findByIdAndUserId(categoryId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category not found for user"));
            if (cat.getKind() != kind) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category kind does not match transaction kind");
            }
            return cat;
        }
        if (categoryName != null && !categoryName.trim().isEmpty()) {
            String name = categoryName.trim();
            return categoryRepository.findByUserIdAndKindAndName(userId, kind, name).orElseGet(() -> {
                Category cat = new Category();
                cat.setUser(user);
                cat.setName(name);
                cat.setKind(kind);
                cat.setCreatedAt(OffsetDateTime.now());
                return categoryRepository.save(cat);
            });
        }
        return null;
    }
}

