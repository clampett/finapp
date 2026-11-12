package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.User;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    Optional<User> findByEmail(String email);

    // Serialized provider linking so concurrent sign-ins could not replace an established identity.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<User> findByGoogleSubject(String googleSubject);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<User> findAllByEmailIgnoreCase(String email);
}
