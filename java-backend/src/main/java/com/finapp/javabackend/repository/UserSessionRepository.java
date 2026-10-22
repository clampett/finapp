package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.UserSession;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {
    @EntityGraph(attributePaths = "user")
    Optional<UserSession> findByToken(String token);

    void deleteByToken(String token);
}
