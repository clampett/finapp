package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.UserSession;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {
    Optional<UserSession> findByToken(String token);
}