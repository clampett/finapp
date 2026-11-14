package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.dto.EdgeDTO;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.dto.NodeDTO;
import com.finapp.javabackend.model.entity.FinancialNode;
import com.finapp.javabackend.model.entity.NodeEdge;
import com.finapp.javabackend.repository.FinancialNodeRepository;
import com.finapp.javabackend.repository.NodeEdgeRepository;
import com.finapp.javabackend.service.impl.GraphServiceImpl;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class GraphServiceTest {

    @Mock
    private FinancialNodeRepository nodeRepository;

    @Mock
    private NodeEdgeRepository edgeRepository;

    @Mock
    private JdbcTemplate jdbc;

    private GraphService graphService;

    @BeforeEach
    void setUp() {
        graphService = new GraphServiceImpl(nodeRepository, edgeRepository, jdbc);
    }

    @Test
    @DisplayName("getFullGraph - Should return all nodes and edges wrapped in GraphDTO")
    void getFullGraph_ShouldReturnGraphDTO() {
        FinancialNode sourceNode = new FinancialNode(
            "Checking Account",
            "CHECKING",
            new BigDecimal("5000.00"),
            new BigDecimal("0.05")
        );
        sourceNode.setId(1L);

        FinancialNode targetNode = new FinancialNode(
            "Savings Account",
            "SAVINGS",
            new BigDecimal("10000.00"),
            new BigDecimal("0.04")
        );
        targetNode.setId(2L);

        NodeEdge mockEdge = new NodeEdge(
            sourceNode,
            targetNode,
            new BigDecimal("500.00"),
            BigDecimal.ZERO
        );
        mockEdge.setId(10L);

        when(nodeRepository.findAll()).thenReturn(List.of(sourceNode, targetNode));
        when(edgeRepository.findAll()).thenReturn(List.of(mockEdge));

        GraphDTO result = graphService.getFullGraph();

        assertNotNull(result);
        assertEquals(2, result.nodes().size());
        assertEquals("Checking Account", result.nodes().get(0).name());
        assertEquals("CHECKING", result.nodes().get(0).nodeType());
        assertEquals(new BigDecimal("5000.00"), result.nodes().get(0).amountOrBalance());

        assertEquals(1, result.edges().size());
        assertEquals(10L, result.edges().get(0).id());

        verify(nodeRepository, times(1)).findAll();
        verify(edgeRepository, times(1)).findAll();
    }

    @Test
    @DisplayName("saveGraph - Should map DTOs to entities and return saved GraphDTO")
    void saveGraph_ShouldSaveAndReturnGraphDTO() {
        NodeDTO inputNodeDTO = new NodeDTO(
            null,
            "Salary",
            "INCOME",
            new BigDecimal("80000.00"),
            BigDecimal.ZERO
        );
        EdgeDTO inputEdgeDTO = new EdgeDTO(
            null,
            1L,
            2L,
            new BigDecimal("1000.00"),
            BigDecimal.ZERO
        );
        GraphDTO inputGraph = new GraphDTO(List.of(inputNodeDTO), List.of(inputEdgeDTO));

        FinancialNode sourceNode = new FinancialNode(
            "Salary",
            "INCOME",
            new BigDecimal("80000.00"),
            BigDecimal.ZERO
        );
        sourceNode.setId(1L);

        FinancialNode targetNode = new FinancialNode(
            "Checking",
            "CHECKING",
            new BigDecimal("5000.00"),
            BigDecimal.ZERO
        );
        targetNode.setId(2L);

        NodeEdge savedEdge = new NodeEdge(
            sourceNode,
            targetNode,
            new BigDecimal("1000.00"),
            BigDecimal.ZERO
        );
        savedEdge.setId(100L);

        when(nodeRepository.saveAll(anyList())).thenReturn(List.of(sourceNode, targetNode));
        when(edgeRepository.saveAll(anyList())).thenReturn(List.of(savedEdge));

        when(
            jdbc.queryForList(
                "SELECT id FROM scenarios WHERE user_id = ? AND LOWER(name) = 'default'",
                Long.class,
                7L
            )
        ).thenReturn(List.of(42L));
        when(nodeRepository.findByIdAndScenarioId(1L, 42L)).thenReturn(Optional.of(sourceNode));
        when(nodeRepository.findByIdAndScenarioId(2L, 42L)).thenReturn(Optional.of(targetNode));
        GraphDTO result = graphService.saveGraph(7L, inputGraph);

        assertNotNull(result);
        assertEquals(1L, result.nodes().get(0).id());
        assertEquals("Salary", result.nodes().get(0).name());
        assertEquals(100L, result.edges().get(0).id());

        verify(nodeRepository).saveAll(
            argThat(nodes -> nodes.iterator().next().getScenarioId().equals(42L))
        );
        verify(edgeRepository).saveAll(
            argThat(edges -> edges.iterator().next().getScenarioId().equals(42L))
        );
    }

    @Test
    void rejectsNodeIdOutsideTheOwnersDefaultScenario() {
        when(
            jdbc.queryForList(
                "SELECT id FROM scenarios WHERE user_id = ? AND LOWER(name) = 'default'",
                Long.class,
                7L
            )
        ).thenReturn(List.of(42L));
        var foreignNode = new NodeDTO(
            99L,
            "Checking",
            "CHECKING",
            BigDecimal.ZERO,
            BigDecimal.ZERO
        );
        assertThrows(ResponseStatusException.class, () ->
            graphService.saveGraph(7L, new GraphDTO(List.of(foreignNode), List.of()))
        );
        verify(nodeRepository, never()).saveAll(anyList());
    }
}
