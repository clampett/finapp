package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.FinancialNode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FinancialNodeRepository extends JpaRepository<FinancialNode, Long> {
    List<FinancialNode> findByProfileId(Long profileId);
}