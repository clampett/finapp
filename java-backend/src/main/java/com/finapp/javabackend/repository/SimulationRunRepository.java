package com.finapp.javabackend.repository; // Ensure this matches your package name exactly

import com.finapp.javabackend.model.entity.SimulationRun;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SimulationRunRepository extends JpaRepository<SimulationRun, Long> {

    // Updated to match the "user" field and "runDate" field in SimulationRun.java
    List<SimulationRun> findByUserIdOrderByRunDateDesc(Long userId);

}