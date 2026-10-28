package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.dto.CreateRecurringTransactionRequest;
import com.finapp.javabackend.dto.RecurringTransactionDTO;
import com.finapp.javabackend.dto.TransactionDTO;
import com.finapp.javabackend.model.entity.RecurringTransaction;
import com.finapp.javabackend.model.entity.Transaction;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.enums.RecurrenceFrequency;
import com.finapp.javabackend.model.enums.TransactionKind;
import com.finapp.javabackend.repository.*;
import com.finapp.javabackend.service.impl.RecurringTransactionServiceImpl;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RecurringTransactionServiceTest {

    @Mock
    private RecurringTransactionRepository recurringRepository;

    @Mock
    private TransactionRepository transactionRepository;

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private CategoryRepository categoryRepository;

    @Mock
    private UserRepository userRepository;

    private RecurringTransactionService recurringService;

    private User user;

    @BeforeEach
    void setUp() {
        recurringService = new RecurringTransactionServiceImpl(
            recurringRepository,
            transactionRepository,
            accountRepository,
            categoryRepository,
            userRepository
        );
        user = new User();
        user.setId(7L);
        user.setUsername("carol");
    }

    @Test
    void createRecurringTransaction_success() {
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        when(recurringRepository.save(any(RecurringTransaction.class))).thenAnswer(i -> {
            RecurringTransaction r = i.getArgument(0);
            r.setId(50L);
            return r;
        });

        CreateRecurringTransactionRequest req = new CreateRecurringTransactionRequest(
            null, null, null, null,
            TransactionKind.expense,
            "Internet subscription",
            new BigDecimal("60.00"),
            RecurrenceFrequency.monthly,
            1,
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 12, 31),
            LocalDate.of(2026, 1, 1),
            true,
            "Fiber 500"
        );

        RecurringTransactionDTO dto = recurringService.createRecurringTransaction(7L, req);

        assertNotNull(dto);
        assertEquals(50L, dto.id());
        assertEquals("Internet subscription", dto.description());
        assertEquals(RecurrenceFrequency.monthly, dto.frequency());
        assertEquals(1, dto.intervalCount());
    }

    @Test
    void generateDueTransactions_generatesOccurrencesAndAdvancesDueDate() {
        RecurringTransaction r = new RecurringTransaction();
        r.setId(10L);
        r.setUser(user);
        r.setDescription("Monthly Gym");
        r.setKind(TransactionKind.expense);
        r.setAmount(new BigDecimal("45.00"));
        r.setFrequency(RecurrenceFrequency.monthly);
        r.setIntervalCount(1);
        r.setStartDate(LocalDate.of(2026, 8, 1));
        r.setNextDueDate(LocalDate.of(2026, 8, 1));
        r.setIsActive(true);

        LocalDate target = LocalDate.of(2026, 10, 1);
        when(recurringRepository.findByUserIdAndIsActiveTrueAndNextDueDateLessThanEqual(7L, target))
            .thenReturn(List.of(r));
        when(transactionRepository.existsByRecurringTransactionIdAndTransactionDate(anyLong(), any(LocalDate.class)))
            .thenReturn(false);
        when(transactionRepository.save(any(Transaction.class))).thenAnswer(i -> {
            Transaction t = i.getArgument(0);
            t.setId(99L);
            return t;
        });

        List<TransactionDTO> generated = recurringService.generateDueTransactions(7L, target);

        // Aug 1, Sep 1, Oct 1 = 3 occurrences
        assertEquals(3, generated.size());
        assertEquals(LocalDate.of(2026, 11, 1), r.getNextDueDate());
        verify(recurringRepository).save(r);
    }

    @Test
    void generateDueTransactions_respectsEndDate() {
        RecurringTransaction r = new RecurringTransaction();
        r.setId(10L);
        r.setUser(user);
        r.setDescription("Temporary Contract");
        r.setKind(TransactionKind.income);
        r.setAmount(new BigDecimal("1000.00"));
        r.setFrequency(RecurrenceFrequency.weekly);
        r.setIntervalCount(1);
        r.setStartDate(LocalDate.of(2026, 10, 1));
        r.setEndDate(LocalDate.of(2026, 10, 15));
        r.setNextDueDate(LocalDate.of(2026, 10, 1));
        r.setIsActive(true);

        LocalDate target = LocalDate.of(2026, 10, 31);
        when(recurringRepository.findByUserIdAndIsActiveTrueAndNextDueDateLessThanEqual(7L, target))
            .thenReturn(List.of(r));
        when(transactionRepository.save(any(Transaction.class))).thenAnswer(i -> i.getArgument(0));

        List<TransactionDTO> generated = recurringService.generateDueTransactions(7L, target);

        // Oct 1, Oct 8, Oct 15 = 3 occurrences. Oct 22 is after end date, so deactivated.
        assertEquals(3, generated.size());
        assertFalse(r.getIsActive());
    }
}

