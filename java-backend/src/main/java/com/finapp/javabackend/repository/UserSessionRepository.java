package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.UserSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import java.util.Optional;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {
    @EntityGraph(attributePaths = "user")
    Optional<UserSession> findByToken(String token);
}
