package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.FinancialProfile;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FinancialProfileRepository extends JpaRepository<FinancialProfile, Long> {
    List<FinancialProfile> findByUserId(Long userId);
}
