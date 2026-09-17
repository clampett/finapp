package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.SimulationRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SimulationRunRepository extends JpaRepository<SimulationRun, Long> {
    List<SimulationRun> findByProfileIdOrderByRanAtDesc(Long profileId);
}