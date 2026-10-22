import * as d3 from 'd3';
import { useEffect, useRef } from 'react';
import { colors, money, typeLabel, types } from '../finance';
import type { GraphData, GraphNode } from '../finance';

export function Canvas({
  graph,
  selected,
  search,
  onSelect,
}: {
  graph: GraphData;
  selected?: string;
  search: string;
  onSelect: (n: GraphNode) => void;
}) {
  // Kept D3 rendering inside one SVG subtree; React retained responsibility for
  // workspace state, controls, forms, and the selected account.
  const ref = useRef<SVGSVGElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const fitRef = useRef<() => void>(() => {});
  const zoomRef = useRef<(factor: number) => void>(() => {});
  useEffect(() => {
    if (!ref.current || !host.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'flow-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#52637a');
    const g = svg.append('g');
    // Grouped nodes by their financial role so the initial arrangement read
    // from income through reserves to expenses, loans, and investments.
    const groups = [
      graph.nodes.filter((n) => n.nodeType === 'INCOME'),
      graph.nodes.filter((n) => ['CHECKING', 'SAVINGS'].includes(n.nodeType)),
      graph.nodes.filter((n) => ['EXPENSE', 'DEBT', 'INVESTMENT'].includes(n.nodeType)),
    ];
    const positions = new Map<
      string,
      {
        x: number;
        y: number;
      }
    >();
    const cardWidth = 184,
      cardHeight = 76;
    groups.forEach((group, col) =>
      group.forEach((n, i) =>
        positions.set(n.id, { x: col * 310, y: i * 110 - (group.length - 1) * 55 }),
      ),
    );
    const paths = g
      .append('g')
      .selectAll('path')
      .data(graph.edges)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', '#39465b')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#flow-arrow)');
    const labels = g
      .append('g')
      .selectAll('text')
      .data(graph.edges)
      .join('text')
      .attr('fill', '#91a0b7')
      .attr('font-size', 10)
      .attr('text-anchor', 'middle')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#0e131d')
      .attr('stroke-width', 5)
      .text((e) =>
        e.monthlyFixedFlow != null ? `${money(e.monthlyFixedFlow)}/mo` : `${e.percentageFlow}%`,
      );
    const cards = g
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(graph.nodes)
      .join('g')
      .attr('class', 'canvas-node')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (n) => `Edit ${n.name}, ${money(n.amountOrBalance)}`)
      .attr('opacity', (n) =>
        !search || n.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0.2,
      )
      .on('click', (_, n) => onSelect(n))
      .on('keydown', (e, n) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(n);
        }
      });
    cards
      .append('rect')
      .attr('width', cardWidth)
      .attr('height', cardHeight)
      .attr('rx', 12)
      .attr('fill', '#171f2e')
      .attr('stroke', (n) => (n.id === selected ? '#e0e7ff' : colors[n.nodeType]))
      .attr('stroke-opacity', (n) => (n.id === selected ? 1 : 0.45))
      .attr('stroke-width', (n) => (n.id === selected ? 2 : 1));
    cards
      .append('circle')
      .attr('cx', 15)
      .attr('cy', 17)
      .attr('r', 3)
      .attr('fill', (n) => colors[n.nodeType]);
    cards
      .append('text')
      .attr('x', 25)
      .attr('y', 21)
      .attr('fill', '#9caec7')
      .attr('font-size', 9)
      .attr('letter-spacing', '1px')
      .text((n) => n.nodeType);
    cards
      .append('text')
      .attr('x', 14)
      .attr('y', 40)
      .attr('fill', '#e7edf8')
      .attr('font-size', 12)
      .text((n) => (n.name.length > 23 ? `${n.name.slice(0, 22)}…` : n.name));
    cards
      .append('text')
      .attr('x', 14)
      .attr('y', 62)
      .attr('fill', (n) => colors[n.nodeType])
      .attr('font-size', 16)
      .attr('font-weight', 650)
      .text(
        (n) =>
          `${money(n.amountOrBalance)}${['INCOME', 'EXPENSE'].includes(n.nodeType) ? ' /mo' : ''}`,
      );
    cards
      .append('title')
      .text(
        (n) => `${n.name}\n${typeLabel(n.nodeType)} · ${money(n.amountOrBalance)}\nClick to edit`,
      );
    function draw() {
      cards.attr('transform', (n) => {
        const p = positions.get(n.id)!;
        return `translate(${p.x},${p.y})`;
      });
      paths.attr('d', (e) => {
        const a = positions.get(e.sourceNodeId)!,
          b = positions.get(e.targetNodeId)!;
        const forward = b.x >= a.x;
        const x1 = a.x + (forward ? cardWidth : 0),
          x2 = b.x + (forward ? 0 : cardWidth),
          y1 = a.y + cardHeight / 2,
          y2 = b.y + cardHeight / 2;
        return `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
      });
      labels
        .attr(
          'x',
          (e) =>
            (positions.get(e.sourceNodeId)!.x + positions.get(e.targetNodeId)!.x + cardWidth) / 2,
        )
        .attr(
          'y',
          (e) => (positions.get(e.sourceNodeId)!.y + positions.get(e.targetNodeId)!.y) / 2 + 29,
        );
    }
    cards.call(
      d3.drag<SVGGElement, GraphNode>().on('drag', (event, n) => {
        const p = positions.get(n.id)!;
        p.x += event.dx;
        p.y += event.dy;
        draw();
      }),
    );
    draw();
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 2.5])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    function fit() {
      const bounds = g.node()?.getBBox();
      if (!bounds || !bounds.width) return;
      const w = host.current!.clientWidth,
        h = host.current!.clientHeight;
      const scale = Math.min(1.15, (w - 56) / bounds.width, (h - 70) / bounds.height);
      svg.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(w / 2, h / 2)
          .scale(Math.max(0.15, scale))
          .translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2),
      );
    }
    fitRef.current = fit;
    zoomRef.current = (factor) => svg.transition().duration(180).call(zoom.scaleBy, factor);
    const observer = new ResizeObserver(fit);
    // Refitted the graph when its host resized and removed the observer and
    // zoom listeners when React replaced or unmounted this canvas.
    observer.observe(host.current);
    fit();
    return () => {
      observer.disconnect();
      svg.on('.zoom', null);
      svg.interrupt();
    };
  }, [graph, selected, search, onSelect]);
  return (
    <div className="canvas-host" ref={host}>
      <div className="canvas-caption">
        <span className="status-dot" /> NODE CASH FLOW MAP{' '}
        <span>Drag to arrange · scroll to zoom · click to edit</span>
      </div>
      <svg ref={ref} aria-label="Financial account connections" className="financial-canvas" />
      {!graph.nodes.length && (
        <div className="canvas-empty">
          <h3>Start with your first node</h3>
          <p>Add nodes for income, accounts, debts, and expenses to build your scenario.</p>
        </div>
      )}
      <div className="canvas-controls">
        <button aria-label="Zoom in" onClick={() => zoomRef.current(1.25)}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => zoomRef.current(0.8)}>
          −
        </button>
        <button onClick={() => fitRef.current()}>Fit view</button>
      </div>
      <div className="canvas-legend">
        {types.map((t) => (
          <span key={t}>
            <i style={{ background: colors[t] }} />
            {typeLabel(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
