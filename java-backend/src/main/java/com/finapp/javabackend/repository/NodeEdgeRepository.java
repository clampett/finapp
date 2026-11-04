package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.NodeEdge;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface NodeEdgeRepository extends JpaRepository<NodeEdge, Long> {
    @Query("SELECT e FROM NodeEdge e WHERE e.sourceNode.id = :nodeId OR e.targetNode.id = :nodeId")
    List<NodeEdge> findAllByNodeId(@Param("nodeId") Long nodeId);

    List<NodeEdge> findByScenarioId(Long scenarioId);
    Optional<NodeEdge> findByIdAndScenarioId(Long id, Long scenarioId);
}
