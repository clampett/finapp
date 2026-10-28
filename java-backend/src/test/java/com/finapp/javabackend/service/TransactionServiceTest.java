package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.dto.CreateTransactionRequest;
import com.finapp.javabackend.dto.TransactionDTO;
import com.finapp.javabackend.dto.UpdateTransactionRequest;
import com.finapp.javabackend.model.entity.Account;
import com.finapp.javabackend.model.entity.Category;
import com.finapp.javabackend.model.entity.Transaction;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.enums.TransactionKind;
import com.finapp.javabackend.repository.*;
import com.finapp.javabackend.service.impl.TransactionServiceImpl;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class TransactionServiceTest {

    @Mock
    private TransactionRepository transactionRepository;

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private CategoryRepository categoryRepository;

    @Mock
    private RecurringTransactionRepository recurringTransactionRepository;

    @Mock
    private UserRepository userRepository;

    private TransactionService transactionService;

    private User user;

    @BeforeEach
    void setUp() {
        transactionService = new TransactionServiceImpl(
            transactionRepository,
            accountRepository,
            categoryRepository,
            recurringTransactionRepository,
            userRepository
        );
        user = new User();
        user.setId(5L);
        user.setUsername("bob");
    }

    @Test
    void createTransaction_success() {
        when(userRepository.findById(5L)).thenReturn(Optional.of(user));
        when(accountRepository.findByUserIdAndName(5L, "Checking")).thenReturn(Optional.empty());
        when(accountRepository.save(any(Account.class))).thenAnswer(i -> {
            Account a = i.getArgument(0);
            a.setId(10L);
            return a;
        });
        when(transactionRepository.save(any(Transaction.class))).thenAnswer(i -> {
            Transaction t = i.getArgument(0);
            t.setId(200L);
            return t;
        });

        CreateTransactionRequest req = new CreateTransactionRequest(
            null,
            "Checking",
            null,
            null,
            null,
            TransactionKind.expense,
            "Groceries",
            new BigDecimal("75.50"),
            LocalDate.of(2026, 10, 27),
            null,
            "Weekly trip",
            5L
        );

        TransactionDTO dto = transactionService.createTransaction(5L, req);

        assertNotNull(dto);
        assertEquals(200L, dto.id());
        assertEquals("Groceries", dto.description());
        assertEquals(TransactionKind.expense, dto.kind());
        assertEquals(new BigDecimal("75.50"), dto.amount());
        assertEquals("Checking", dto.accountName());
    }

    @Test
    void createTransaction_invalidAmount_throwsBadRequest() {
        CreateTransactionRequest req = new CreateTransactionRequest(
            null,
            "Checking",
            null,
            null,
            null,
            TransactionKind.expense,
            "Groceries",
            new BigDecimal("0.00"),
            null,
            null,
            null,
            5L
        );

        assertThrows(ResponseStatusException.class, () ->
            transactionService.createTransaction(5L, req)
        );
    }

    @Test
    void getTransactions_filtersProperly() {
        Transaction t = new Transaction();
        t.setId(1L);
        t.setUser(user);
        t.setDescription("Salary");
        t.setKind(TransactionKind.income);
        t.setAmount(new BigDecimal("3000.00"));
        t.setTransactionDate(LocalDate.of(2026, 10, 15));

        when(transactionRepository.findByUserIdOrderByTransactionDateDesc(5L)).thenReturn(
            List.of(t)
        );

        List<TransactionDTO> list = transactionService.getTransactions(5L, null, null, null, null);
        assertEquals(1, list.size());
        assertEquals("Salary", list.get(0).description());
    }

    @Test
    void deleteTransaction_success() {
        Transaction t = new Transaction();
        t.setId(1L);
        when(transactionRepository.findByIdAndUserId(1L, 5L)).thenReturn(Optional.of(t));

        transactionService.deleteTransaction(5L, 1L);
        verify(transactionRepository).delete(t);
    }

    @Test
    void updateTransactionUsesTheNewAccountId() {
        Transaction transaction = new Transaction();
        transaction.setId(1L);
        transaction.setUser(user);
        transaction.setKind(TransactionKind.expense);
        Account savings = new Account();
        savings.setId(2L);
        savings.setName("Savings");
        when(transactionRepository.findByIdAndUserId(1L, 5L)).thenReturn(Optional.of(transaction));
        when(accountRepository.findByIdAndUserId(2L, 5L)).thenReturn(Optional.of(savings));
        when(transactionRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        var result = transactionService.updateTransaction(
            5L,
            1L,
            new UpdateTransactionRequest(
                2L,
                "Savings",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
            )
        );
        assertEquals(2L, result.accountId());
        assertEquals("Savings", result.accountName());
    }

    @Test
    void changingKindCanClearThePreviousCategory() {
        Transaction transaction = new Transaction();
        transaction.setId(1L);
        transaction.setUser(user);
        transaction.setKind(TransactionKind.expense);
        Category rent = new Category();
        rent.setKind(TransactionKind.expense);
        transaction.setCategory(rent);
        when(transactionRepository.findByIdAndUserId(1L, 5L)).thenReturn(Optional.of(transaction));
        when(transactionRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        var result = transactionService.updateTransaction(
            5L,
            1L,
            new UpdateTransactionRequest(
                null,
                null,
                null,
                "",
                null,
                TransactionKind.income,
                null,
                null,
                null,
                null,
                null
            )
        );
        assertEquals(TransactionKind.income, result.kind());
        assertNull(result.categoryId());
        assertNull(transaction.getCategory());
    }
}
