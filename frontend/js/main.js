const API_BASE_URL = 'http://localhost:8081/api/v1';

async function loadArchetypeGraph(userId) {
    try {
        console.log(`Fetching graph for Archetype ${userId}...`);
        const response = await fetch(`${API_BASE_URL}/graph/${userId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const responseBody = await response.json();
        
        if (responseBody.success) {
            const graphData = responseBody.data;
            console.log('Successfully extracted GraphDTO:', graphData);
            
            // Pass the data to our new D3 rendering function
            renderGraph(graphData);
            
        } else {
            console.error('Backend returned an error:', responseBody.message);
        }
        
    } catch (error) {
        console.error('Failed to fetch graph data:', error);
    }
}

function renderGraph(graphData) {
    // 1. Setup Canvas
    const container = d3.select("body"); // Or select your specific #graph-container div
    container.selectAll("svg").remove(); // Clear any existing graph
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height);

    // 2. Format Data for D3
    // D3 needs 'source' and 'target' properties on links that match node IDs
    const nodes = graphData.nodes.map(d => Object.create(d));
    const links = graphData.edges.map(d => ({
        ...Object.create(d),
        source: d.sourceNodeId,
        target: d.targetNodeId
    }));

    // 3. Setup Physics Simulation
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(150))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(width / 2, height / 2));

    // 4. Draw Edges (Lines)
    const link = svg.append("g")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6)
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke-width", 2);

    // 5. Draw Nodes (Circles)
    const node = svg.append("g")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", 20)
        .attr("fill", "#69b3a2")
        .call(drag(simulation));

    // 6. Add Labels (Text)
    const labels = svg.append("g")
        .selectAll("text")
        .data(nodes)
        .join("text")
        .attr("dy", -25)
        .attr("text-anchor", "middle")
        .attr("fill", "#333") // Changed to dark gray for the white background
        .attr("font-family", "sans-serif")
        .attr("font-weight", "bold")
        .attr("font-size", "14px")
        .text(d => {
            // Format the amount with commas (e.g., 22000 -> 22,000)
            const formattedAmount = Number(d.amountOrBalance).toLocaleString();
            return `${d.name} ($${formattedAmount})`;
        });

    // 7. Tick Function (Updates positions on every animation frame)
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
            
        labels
            .attr("x", d => d.x)
            .attr("y", d => d.y);
    });
}

// Helper function to allow dragging nodes around
function drag(simulation) {
    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }
    
    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }
    
    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }
    
    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
}

// Load Archetype 1 on startup
loadArchetypeGraph(1);