package com.finapp.javabackend.repository; // Ensure this matches your package name exactly

import com.finapp.javabackend.model.entity.SimulationRun;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SimulationRunRepository extends JpaRepository<SimulationRun, Long> {
    // Updated to match the "user" field and "runDate" field in SimulationRun.java
    List<SimulationRun> findByUserIdOrderByRunDateDesc(Long userId);
}
