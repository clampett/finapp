package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.CreateRecurringTransactionRequest;
import com.finapp.javabackend.dto.RecurringTransactionDTO;
import com.finapp.javabackend.dto.TransactionDTO;
import com.finapp.javabackend.dto.UpdateRecurringTransactionRequest;
import com.finapp.javabackend.model.entity.*;
import com.finapp.javabackend.model.enums.AccountType;
import com.finapp.javabackend.model.enums.RecurrenceFrequency;
import com.finapp.javabackend.model.enums.TransactionKind;
import com.finapp.javabackend.repository.*;
import com.finapp.javabackend.service.RecurringTransactionService;
import com.finapp.javabackend.service.mapper.EntityDtoMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class RecurringTransactionServiceImpl implements RecurringTransactionService {

    private final RecurringTransactionRepository recurringRepository;
    private final TransactionRepository transactionRepository;
    private final AccountRepository accountRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;

    public RecurringTransactionServiceImpl(
        RecurringTransactionRepository recurringRepository,
        TransactionRepository transactionRepository,
        AccountRepository accountRepository,
        CategoryRepository categoryRepository,
        UserRepository userRepository
    ) {
        this.recurringRepository = recurringRepository;
        this.transactionRepository = transactionRepository;
        this.accountRepository = accountRepository;
        this.categoryRepository = categoryRepository;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<RecurringTransactionDTO> getRecurringTransactions(Long userId) {
        return recurringRepository
            .findByUserId(userId)
            .stream()
            .map(EntityDtoMapper::toDto)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public RecurringTransactionDTO getRecurringTransaction(Long userId, Long id) {
        RecurringTransaction recurring = recurringRepository
            .findByIdAndUserId(id, userId)
            .orElseThrow(() ->
                new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Recurring transaction template not found"
                )
            );
        return EntityDtoMapper.toDto(recurring);
    }

    @Override
    public RecurringTransactionDTO createRecurringTransaction(
        Long userId,
        CreateRecurringTransactionRequest request
    ) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request cannot be empty");
        }
        if (request.kind() == null) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Kind (income/expense) is required"
            );
        }
        if (request.frequency() == null) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Recurrence frequency is required"
            );
        }
        if (request.amount() == null || request.amount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Amount must be strictly greater than 0"
            );
        }
        if (request.description() == null || request.description().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Description is required");
        }

        User user = userRepository
            .findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        LocalDate startDate = request.effectiveStartDate();
        LocalDate endDate = request.endDate();
        if (endDate != null && endDate.isBefore(startDate)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "End date cannot be before start date"
            );
        }

        Account account = resolveAccount(userId, user, request.accountId(), request.accountName());
        Category category = resolveCategory(
            userId,
            user,
            request.categoryId(),
            request.categoryName(),
            request.kind()
        );

        RecurringTransaction recurring = new RecurringTransaction();
        recurring.setUser(user);
        recurring.setAccount(account);
        recurring.setCategory(category);
        recurring.setKind(request.kind());
        recurring.setDescription(request.description().trim());
        recurring.setAmount(request.amount());
        recurring.setFrequency(request.frequency());
        recurring.setIntervalCount(request.effectiveIntervalCount());
        recurring.setStartDate(startDate);
        recurring.setEndDate(endDate);
        recurring.setNextDueDate(request.effectiveNextDueDate());
        recurring.setIsActive(request.isActive() != null ? request.isActive() : Boolean.TRUE);
        recurring.setNotes(request.notes());
        recurring.setCreatedAt(OffsetDateTime.now());
        recurring.setUpdatedAt(OffsetDateTime.now());

        return EntityDtoMapper.toDto(recurringRepository.save(recurring));
    }

    @Override
    public RecurringTransactionDTO updateRecurringTransaction(
        Long userId,
        Long id,
        UpdateRecurringTransactionRequest request
    ) {
        RecurringTransaction recurring = recurringRepository
            .findByIdAndUserId(id, userId)
            .orElseThrow(() ->
                new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Recurring transaction template not found"
                )
            );

        if (request.kind() != null) {
            recurring.setKind(request.kind());
        }
        if (request.amount() != null) {
            if (request.amount().compareTo(BigDecimal.ZERO) <= 0) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Amount must be greater than 0"
                );
            }
            recurring.setAmount(request.amount());
        }
        if (request.description() != null && !request.description().trim().isEmpty()) {
            recurring.setDescription(request.description().trim());
        }
        if (request.frequency() != null) {
            recurring.setFrequency(request.frequency());
        }
        if (request.intervalCount() != null && request.intervalCount() > 0) {
            recurring.setIntervalCount(request.intervalCount());
        }
        if (request.startDate() != null) {
            recurring.setStartDate(request.startDate());
        }
        if (request.endDate() != null) {
            if (
                recurring.getStartDate() != null &&
                request.endDate().isBefore(recurring.getStartDate())
            ) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "End date cannot be before start date"
                );
            }
            recurring.setEndDate(request.endDate());
        }
        if (request.nextDueDate() != null) {
            recurring.setNextDueDate(request.nextDueDate());
        }
        if (request.isActive() != null) {
            recurring.setIsActive(request.isActive());
        }
        if (request.notes() != null) {
            recurring.setNotes(request.notes());
        }

        if (request.accountId() != null || request.accountName() != null) {
            recurring.setAccount(
                resolveAccount(
                    userId,
                    recurring.getUser(),
                    request.accountId(),
                    request.accountName()
                )
            );
        }
        if (request.categoryId() != null || request.categoryName() != null) {
            recurring.setCategory(
                resolveCategory(
                    userId,
                    recurring.getUser(),
                    request.categoryId(),
                    request.categoryName(),
                    recurring.getKind()
                )
            );
        } else if (
            recurring.getCategory() != null &&
            recurring.getCategory().getKind() != recurring.getKind()
        ) {
            // Cleared the old category when the recurring rule changed its income/expense kind.
            recurring.setCategory(null);
        }

        recurring.setUpdatedAt(OffsetDateTime.now());
        return EntityDtoMapper.toDto(recurringRepository.save(recurring));
    }

    @Override
    public void deleteRecurringTransaction(Long userId, Long id) {
        RecurringTransaction recurring = recurringRepository
            .findByIdAndUserId(id, userId)
            .orElseThrow(() ->
                new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Recurring transaction template not found"
                )
            );
        recurringRepository.delete(recurring);
    }

    @Override
    public List<TransactionDTO> generateDueTransactions(Long userId, LocalDate throughDate) {
        LocalDate target = throughDate != null ? throughDate : LocalDate.now();
        List<RecurringTransaction> dueList =
            recurringRepository.findByUserIdAndIsActiveTrueAndNextDueDateLessThanEqual(
                userId,
                target
            );
        List<TransactionDTO> generated = new ArrayList<>();

        for (RecurringTransaction recurring : dueList) {
            generated.addAll(processOccurrences(recurring, target));
        }

        return generated;
    }

    @Override
    public List<TransactionDTO> generateForRecurringTransaction(
        Long userId,
        Long recurringId,
        LocalDate throughDate
    ) {
        RecurringTransaction recurring = recurringRepository
            .findByIdAndUserId(recurringId, userId)
            .orElseThrow(() ->
                new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Recurring transaction template not found"
                )
            );
        LocalDate target = throughDate != null ? throughDate : LocalDate.now();
        return processOccurrences(recurring, target);
    }

    private List<TransactionDTO> processOccurrences(
        RecurringTransaction recurring,
        LocalDate target
    ) {
        List<TransactionDTO> result = new ArrayList<>();

        while (
            Boolean.TRUE.equals(recurring.getIsActive()) &&
            recurring.getNextDueDate() != null &&
            !recurring.getNextDueDate().isAfter(target)
        ) {
            LocalDate occurrenceDate = recurring.getNextDueDate();

            if (recurring.getEndDate() != null && occurrenceDate.isAfter(recurring.getEndDate())) {
                recurring.setIsActive(false);
                break;
            }

            // Check if occurrence already exists to prevent duplicate
            if (
                !transactionRepository.existsByRecurringTransactionIdAndTransactionDate(
                    recurring.getId(),
                    occurrenceDate
                )
            ) {
                Transaction txn = new Transaction();
                txn.setUser(recurring.getUser());
                txn.setAccount(recurring.getAccount());
                txn.setCategory(recurring.getCategory());
                txn.setRecurringTransaction(recurring);
                txn.setKind(recurring.getKind());
                txn.setDescription(recurring.getDescription());
                txn.setAmount(recurring.getAmount());
                txn.setTransactionDate(occurrenceDate);
                txn.setNotes(recurring.getNotes());
                txn.setCreatedAt(OffsetDateTime.now());
                txn.setUpdatedAt(OffsetDateTime.now());

                Transaction saved = transactionRepository.save(txn);
                result.add(EntityDtoMapper.toDto(saved));
            }

            LocalDate nextDue = calculateNextDate(
                occurrenceDate,
                recurring.getFrequency(),
                recurring.getIntervalCount()
            );
            recurring.setNextDueDate(nextDue);

            if (recurring.getEndDate() != null && nextDue.isAfter(recurring.getEndDate())) {
                recurring.setIsActive(false);
            }
        }

        recurring.setUpdatedAt(OffsetDateTime.now());
        recurringRepository.save(recurring);
        return result;
    }

    public static LocalDate calculateNextDate(
        LocalDate current,
        RecurrenceFrequency frequency,
        int intervalCount
    ) {
        int count = Math.max(1, intervalCount);
        return switch (frequency) {
            case daily -> current.plusDays(count);
            case weekly -> current.plusWeeks(count);
            case biweekly -> current.plusWeeks(2L * count);
            case monthly -> current.plusMonths(count);
            case quarterly -> current.plusMonths(3L * count);
            case yearly -> current.plusYears(count);
        };
    }

    private Account resolveAccount(Long userId, User user, Long accountId, String accountName) {
        if (accountId != null) {
            return accountRepository
                .findByIdAndUserId(accountId, userId)
                .orElseThrow(() ->
                    new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Account not found for user"
                    )
                );
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

    private Category resolveCategory(
        Long userId,
        User user,
        Long categoryId,
        String categoryName,
        TransactionKind kind
    ) {
        if (categoryId != null) {
            Category cat = categoryRepository
                .findByIdAndUserId(categoryId, userId)
                .orElseThrow(() ->
                    new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Category not found for user"
                    )
                );
            if (cat.getKind() != kind) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Category kind does not match recurring transaction kind"
                );
            }
            return cat;
        }
        if (categoryName != null && !categoryName.trim().isEmpty()) {
            String name = categoryName.trim();
            return categoryRepository
                .findByUserIdAndKindAndName(userId, kind, name)
                .orElseGet(() -> {
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
