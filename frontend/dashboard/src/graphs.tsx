import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import { SimulationModal } from './SimulationModal';

const API_BASE_URL = 'http://localhost:8081/api/v1';

interface GraphNode {
  id: string;
  name: string;
  amountOrBalance: number | string;
  nodeType?: string;
}

interface GraphEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function ArchetypeGraph({ userId }: { userId: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentGraph, setCurrentGraph] = useState<GraphData | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  const searchParams = new URLSearchParams(window.location.search);
  const isDemoMode = searchParams.get('demo') === 'true';

  useEffect(() => {
    const fetchAndRenderGraph = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/graph/${userId}`);
        if (!response.ok) {
          setCurrentGraph({ nodes: [], edges: [] });
          if (containerRef.current) d3.select(containerRef.current).selectAll("svg").remove();
          return;
        }
        
        const responseBody = await response.json();
        
        if (responseBody.success && responseBody.data) {
          setCurrentGraph(responseBody.data);
          renderGraph(responseBody.data);
        } else {
          setCurrentGraph({ nodes: [], edges: [] });
          if (containerRef.current) d3.select(containerRef.current).selectAll("svg").remove();
        }
      } catch (error) {
        console.error('Failed to fetch graph data:', error);
        setCurrentGraph({ nodes: [], edges: [] });
      }
    };

    fetchAndRenderGraph();

    return () => {
      if (containerRef.current) d3.select(containerRef.current).selectAll("*").remove();
    };
  }, [userId]);

  const renderGraph = (graphData: GraphData) => {
    if (containerRef.current) d3.select(containerRef.current).selectAll("svg").remove();
    if (!graphData.nodes || graphData.nodes.length === 0) return;

    const width = window.innerWidth;
    const height = window.innerHeight - 150;
    
    const svg = d3.select(containerRef.current)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto; outline: none; background-color: #0B0B10;");

    // Grid Background
    const defs = svg.append("defs");
    const minorGrid = defs.append("pattern").attr("id", "minorGrid").attr("width", 20).attr("height", 20).attr("patternUnits", "userSpaceOnUse");
    minorGrid.append("path").attr("d", "M 20 0 L 0 0 0 20").attr("fill", "none").attr("stroke", "rgba(255,255,255,0.03)").attr("stroke-width", 1);

    const majorGrid = defs.append("pattern").attr("id", "majorGrid").attr("width", 100).attr("height", 100).attr("patternUnits", "userSpaceOnUse");
    majorGrid.append("rect").attr("width", 100).attr("height", 100).attr("fill", "url(#minorGrid)");
    majorGrid.append("path").attr("d", "M 100 0 L 0 0 0 100").attr("fill", "none").attr("stroke", "rgba(255,255,255,0.06)").attr("stroke-width", 1);

    svg.append("rect").attr("width", "100%").attr("height", "100%").attr("fill", "url(#majorGrid)");

    const g = svg.append("g");
    const nodes = graphData.nodes.map(d => Object.create(d));
    const links = graphData.edges.map(d => ({ ...Object.create(d), source: d.sourceNodeId, target: d.targetNodeId }));

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(300)) 
      .force("charge", d3.forceManyBody().strength(-800)) 
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(110)); 

    const link = g.append("g").attr("stroke", "#4b5563").attr("stroke-opacity", 0.6).selectAll("line").data(links).join("line").attr("stroke-width", 2);

    const nodeWidth = 160;
    const nodeHeight = 70;

    const node = g.append("g")
      .selectAll("foreignObject")
      .data(nodes)
      .join("foreignObject")
      .attr("width", nodeWidth)
      .attr("height", nodeHeight)
      .attr("overflow", "visible")
      .call(drag(simulation) as any);

    node.append("xhtml:div")
      .attr("class", "w-full h-full bg-[#1A1A1F] border border-gray-700 rounded-lg shadow-lg flex flex-col justify-center items-center text-white cursor-grab active:cursor-grabbing hover:border-indigo-400 transition-colors duration-200 select-none")
      .html((d: any) => {
        const formattedAmount = Number(d.amountOrBalance).toLocaleString();
        return `
          <div class="text-sm text-gray-400 font-semibold truncate w-11/12 text-center tracking-wide uppercase">${d.name}</div>
          <div class="text-lg font-bold text-indigo-400 mt-1">$${formattedAmount}</div>
        `;
      });

    simulation.on("tick", () => {
      link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y).attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      node.attr("x", (d: any) => d.x - nodeWidth / 2).attr("y", (d: any) => d.y - nodeHeight / 2);
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        majorGrid.attr("patternTransform", `translate(${event.transform.x}, ${event.transform.y}) scale(${event.transform.k})`);
      });

    svg.call(zoom);
    const initialScale = width < 1024 ? 0.65 : 0.95;
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(initialScale).translate(-width / 2, -height / 2));

    function drag(simulation: d3.Simulation<any, undefined>) {
      function dragstarted(event: any) { if (!event.active) simulation.alphaTarget(0.3).restart(); event.subject.fx = event.subject.x; event.subject.fy = event.subject.y; }
      function dragged(event: any) { event.subject.fx = event.x; event.subject.fy = event.y; }
      function dragended(event: any) { if (!event.active) simulation.alphaTarget(0); event.subject.fx = null; event.subject.fy = null; }
      return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col">
      
      {/* TOP ACTION BAR: Clean header with Forecast Button */}
      <div className="flex items-center justify-between px-6 py-4 bg-[#111116] border-b border-gray-800 z-10">
        <div>
          <h1 className="text-lg font-bold text-white">{isDemoMode ? "Demo Financial Canvas" : "Your Financial Canvas"}</h1>
          <p className="text-xs text-gray-400">Map your income, assets, and liabilities below.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          disabled={!currentGraph || currentGraph.nodes.length === 0}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg shadow-lg transition-colors disabled:opacity-50 cursor-pointer"
        >
          Run 30-Year Forecast
        </button>
      </div>

      {/* GRAPH CANVAS OR EMPTY STATE */}
      <div className="relative flex-1 w-full h-full">
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Empty state for real users who haven't added nodes yet */}
        {(!currentGraph || currentGraph.nodes.length === 0) && !isDemoMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-6 bg-[#0B0B10]">
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400 text-2xl font-bold">+</div>
            <h2 className="text-xl font-bold text-white mb-2">Your canvas is empty</h2>
            <p className="text-sm text-gray-400 max-w-md mb-6">It looks like you haven't added any financial accounts or income streams yet. Start mapping your financial web to run forecasts.</p>
          </div>
        )}
      </div>

      {showModal && currentGraph && (
        <SimulationModal 
          graphData={currentGraph} 
          onClose={() => setShowModal(false)} 
        />
      )}
    </div>
  );
}