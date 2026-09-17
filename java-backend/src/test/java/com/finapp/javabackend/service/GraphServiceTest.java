package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.dto.NodeDTO;
import com.finapp.javabackend.model.entity.FinancialNode;
import com.finapp.javabackend.model.entity.FinancialProfile;
import com.finapp.javabackend.model.entity.NodeType;
import com.finapp.javabackend.repository.FinancialNodeRepository;
import com.finapp.javabackend.repository.FinancialProfileRepository;
import com.finapp.javabackend.repository.NodeEdgeRepository;
import com.finapp.javabackend.service.impl.GraphServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GraphServiceTest {

    @Mock
    private FinancialProfileRepository profileRepository;

    @Mock
    private FinancialNodeRepository nodeRepository;

    @Mock
    private NodeEdgeRepository edgeRepository;

    @InjectMocks
    private GraphServiceImpl graphService;

    @Test
    void testGetUserGraphByProfileId() {
        FinancialNode node = new FinancialNode();
        node.setName("Checking Account");
        node.setNodeType(NodeType.CHECKING);
        node.setCurrentBalance(new BigDecimal("1500.00"));
        node.setInterestRateApr(new BigDecimal("0.05"));

        when(nodeRepository.findByProfileId(1L)).thenReturn(List.of(node));

        GraphDTO result = graphService.getUserGraphByProfileId(1L);

        assertNotNull(result);
        assertEquals(1L, result.profileId());
        assertEquals(1, result.nodes().size());
        assertEquals("Checking Account", result.nodes().get(0).name());
    }
}