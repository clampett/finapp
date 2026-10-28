package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.dto.AccountDTO;
import com.finapp.javabackend.dto.CreateAccountRequest;
import com.finapp.javabackend.dto.UpdateAccountRequest;
import com.finapp.javabackend.model.entity.Account;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.enums.AccountType;
import com.finapp.javabackend.repository.AccountRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.impl.AccountServiceImpl;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private UserRepository userRepository;

    private AccountService accountService;

    private User user;

    @BeforeEach
    void setUp() {
        accountService = new AccountServiceImpl(accountRepository, userRepository);
        user = new User();
        user.setId(10L);
        user.setUsername("alice");
    }

    @Test
    void createAccount_success() {
        when(accountRepository.existsByUserIdAndName(10L, "Emergency Fund")).thenReturn(false);
        when(userRepository.findById(10L)).thenReturn(Optional.of(user));
        when(accountRepository.save(any(Account.class))).thenAnswer(invocation -> {
            Account acc = invocation.getArgument(0);
            acc.setId(101L);
            return acc;
        });

        CreateAccountRequest request = new CreateAccountRequest(
            "Emergency Fund",
            AccountType.savings,
            new BigDecimal("1000.00"),
            true
        );

        AccountDTO result = accountService.createAccount(10L, request);

        assertNotNull(result);
        assertEquals(101L, result.id());
        assertEquals("Emergency Fund", result.name());
        assertEquals(AccountType.savings, result.type());
        assertEquals(new BigDecimal("1000.00"), result.openingBalance());
    }

    @Test
    void createAccount_duplicateName_throwsConflict() {
        when(accountRepository.existsByUserIdAndName(10L, "Checking")).thenReturn(true);

        CreateAccountRequest request = new CreateAccountRequest(
            "Checking",
            AccountType.checking,
            BigDecimal.ZERO,
            true
        );

        assertThrows(ResponseStatusException.class, () -> accountService.createAccount(10L, request));
    }

    @Test
    void getAccounts_returnsUserAccounts() {
        Account acc = new Account();
        acc.setId(1L);
        acc.setUser(user);
        acc.setName("Checking");
        acc.setType(AccountType.checking);
        when(accountRepository.findByUserId(10L)).thenReturn(List.of(acc));

        List<AccountDTO> list = accountService.getAccounts(10L);
        assertEquals(1, list.size());
        assertEquals("Checking", list.get(0).name());
    }

    @Test
    void updateAccount_success() {
        Account acc = new Account();
        acc.setId(1L);
        acc.setUser(user);
        acc.setName("Old Name");
        acc.setType(AccountType.checking);

        when(accountRepository.findByIdAndUserId(1L, 10L)).thenReturn(Optional.of(acc));
        when(accountRepository.existsByUserIdAndName(10L, "New Name")).thenReturn(false);
        when(accountRepository.save(any(Account.class))).thenAnswer(i -> i.getArgument(0));

        UpdateAccountRequest req = new UpdateAccountRequest("New Name", AccountType.savings, null, null);
        AccountDTO updated = accountService.updateAccount(10L, 1L, req);

        assertEquals("New Name", updated.name());
        assertEquals(AccountType.savings, updated.type());
    }

    @Test
    void deleteAccount_success() {
        Account acc = new Account();
        acc.setId(1L);
        when(accountRepository.findByIdAndUserId(1L, 10L)).thenReturn(Optional.of(acc));

        accountService.deleteAccount(10L, 1L);
        verify(accountRepository).delete(acc);
    }
}

