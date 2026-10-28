package com.finapp.javabackend.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class LocalDevelopmentDataTest {

    @Test
    void existingDifferentPasswordIsNeverOverwritten() {
        UserRepository users = mock(UserRepository.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var passwords = new BCryptPasswordEncoder();
        User existing = new User();
        existing.setPasswordHash(passwords.encode("personal-password"));
        when(users.findByUsername("testuser")).thenReturn(Optional.of(existing));
        var seed = new LocalDevelopmentData(users, passwords, jdbc);
        assertThrows(IllegalStateException.class, () -> seed.run(null));
        assertTrue(passwords.matches("personal-password", existing.getPasswordHash()));
        verify(users, never()).save(any());
        verify(users, never()).saveAndFlush(any());
        verifyNoInteractions(jdbc);
    }
}
