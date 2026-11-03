package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.EdgeDTO;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.dto.NodeDTO;
import com.finapp.javabackend.model.entity.FinancialNode;
import com.finapp.javabackend.model.entity.NodeEdge;
import com.finapp.javabackend.repository.FinancialNodeRepository;
import com.finapp.javabackend.repository.NodeEdgeRepository;
import com.finapp.javabackend.service.GraphService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GraphServiceImpl implements GraphService {

    private final FinancialNodeRepository nodeRepository;
    private final NodeEdgeRepository edgeRepository;
    private final JdbcTemplate jdbc;

    public GraphServiceImpl(
        FinancialNodeRepository nodeRepository,
        NodeEdgeRepository edgeRepository,
        JdbcTemplate jdbc
    ) {
        this.nodeRepository = nodeRepository;
        this.edgeRepository = edgeRepository;
        this.jdbc = jdbc;
    }

    @Override
    @Transactional
    public GraphDTO saveGraph(Long userId, GraphDTO graphDTO) {
        // Scoped the existing graph endpoint to the authenticated owner’s default scenario.
        Long scenarioId = defaultScenario(userId);
        if (scenarioId == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workspace not found.");
        // Map DTOs -> Entities for Nodes
        List<FinancialNode> nodesToSave = graphDTO
            .nodes()
            .stream()
            .map(dto -> {
                FinancialNode node = new FinancialNode(
                    dto.name(),
                    dto.nodeType(),
                    dto.amountOrBalance(),
                    dto.interestRateApr()
                );
                node.setProfileId(userId);
                node.setScenarioId(scenarioId);
                if (dto.id() != null) {
                    requireNode(dto.id(), scenarioId);
                    node.setId(dto.id());
                }
                return node;
            })
            .toList();

        List<FinancialNode> savedNodes = nodeRepository.saveAll(nodesToSave);

        // Checked both endpoints and any existing edge ID against the same scenario.
        List<NodeEdge> edgesToSave = graphDTO
            .edges()
            .stream()
            .map(dto -> {
                FinancialNode sourceNode = requireNode(dto.sourceNodeId(), scenarioId);
                FinancialNode targetNode = requireNode(dto.targetNodeId(), scenarioId);
                NodeEdge edge = new NodeEdge(
                    sourceNode,
                    targetNode,
                    dto.monthlyFixedFlow(),
                    dto.percentageFlow()
                );
                edge.setScenarioId(scenarioId);
                if (dto.id() != null) {
                    edgeRepository.findByIdAndScenarioId(dto.id(), scenarioId).orElseThrow(() ->
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "Connection not found in this scenario.")
                    );
                    edge.setId(dto.id());
                }
                return edge;
            })
            .toList();

        List<NodeEdge> savedEdges = edgeRepository.saveAll(edgesToSave);

        // Map Entities -> DTOs
        List<NodeDTO> nodeDTOs = savedNodes
            .stream()
            .map(n ->
                new NodeDTO(
                    n.getId(),
                    n.getName(),
                    n.getNodeType(),
                    n.getAmountOrBalance(),
                    n.getInterestRateApr()
                )
            )
            .toList();

        List<EdgeDTO> edgeDTOs = savedEdges
            .stream()
            .map(e ->
                new EdgeDTO(
                    e.getId(),
                    e.getSourceNode().getId(),
                    e.getTargetNode().getId(),
                    e.getMonthlyFixedFlow(),
                    e.getPercentageFlow()
                )
            )
            .toList();

        return new GraphDTO(nodeDTOs, edgeDTOs);
    }

    @Override
    @Transactional(readOnly = true)
    public GraphDTO getFullGraph() {
        List<NodeDTO> nodeDTOs = nodeRepository
            .findAll()
            .stream()
            .map(n ->
                new NodeDTO(
                    n.getId(),
                    n.getName(),
                    n.getNodeType(),
                    n.getAmountOrBalance(),
                    n.getInterestRateApr()
                )
            )
            .toList();

        List<EdgeDTO> edgeDTOs = edgeRepository
            .findAll()
            .stream()
            .map(e ->
                new EdgeDTO(
                    e.getId(),
                    e.getSourceNode().getId(),
                    e.getTargetNode().getId(),
                    e.getMonthlyFixedFlow(),
                    e.getPercentageFlow()
                )
            )
            .toList();

        return new GraphDTO(nodeDTOs, edgeDTOs);
    }

    @Override
    @Transactional(readOnly = true)
    public GraphDTO getGraphForUser(Long userId) {
        Long scenarioId = defaultScenario(userId);
        if (scenarioId == null) return new GraphDTO(List.of(), List.of());
        List<FinancialNode> nodes = nodeRepository.findByScenarioId(scenarioId);
        List<NodeEdge> edges = edgeRepository.findByScenarioId(scenarioId);

        // Map Entities -> DTOs using your exact existing mapping logic
        List<NodeDTO> nodeDTOs = nodes
            .stream()
            .map(n ->
                new NodeDTO(
                    n.getId(),
                    n.getName(),
                    n.getNodeType(),
                    n.getAmountOrBalance(),
                    n.getInterestRateApr()
                )
            )
            .toList();

        List<EdgeDTO> edgeDTOs = edges
            .stream()
            .map(e ->
                new EdgeDTO(
                    e.getId(),
                    e.getSourceNode().getId(),
                    e.getTargetNode().getId(),
                    e.getMonthlyFixedFlow(),
                    e.getPercentageFlow()
                )
            )
            .toList();

        return new GraphDTO(nodeDTOs, edgeDTOs);
    }
    private Long defaultScenario(Long userId) {
        return jdbc.queryForList(
            "SELECT id FROM scenarios WHERE user_id = ? AND LOWER(name) = 'default'",
            Long.class,
            userId
        ).stream().findFirst().orElse(null);
    }

    private FinancialNode requireNode(Long nodeId, Long scenarioId) {
        return nodeRepository.findByIdAndScenarioId(nodeId, scenarioId).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found in this scenario.")
        );
    }
}
