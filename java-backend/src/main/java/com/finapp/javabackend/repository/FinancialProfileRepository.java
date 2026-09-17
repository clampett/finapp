package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.FinancialProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FinancialProfileRepository extends JpaRepository<FinancialProfile, Long> {
    List<FinancialProfile> findByUserId(Long userId);
}