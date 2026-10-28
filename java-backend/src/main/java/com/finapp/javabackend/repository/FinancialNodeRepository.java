package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.FinancialNode;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FinancialNodeRepository extends JpaRepository<FinancialNode, Long> {
    List<FinancialNode> findByProfileId(Long profileId);
}
