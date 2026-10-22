package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.AuthToken;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthTokenRepository extends JpaRepository<AuthToken, Long> {
    Optional<AuthToken> findByTokenAndTokenType(String token, String tokenType);
    Optional<AuthToken> findByUserIdAndTokenAndTokenType(
        Long userId,
        String token,
        String tokenType
    );
    void deleteByUserIdAndTokenType(Long userId, String tokenType);
}
