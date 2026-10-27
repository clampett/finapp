package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.Account;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, Long> {
    List<Account> findByUserId(Long userId);
}
