package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.AuthToken;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AuthTokenRepository extends JpaRepository<AuthToken, Long> {
    Optional<AuthToken> findByTokenAndTokenType(String token, String tokenType);
}