// Basic JavaScript for the finance dashboard
console.log('Finance Dashboard loaded');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded - initializing dashboard');
    
    // Create a simple visualization using D3.js
    createDashboard();
});

function createDashboard() {
    const container = document.getElementById('graph-container');
    
    // Simple test to verify D3 is working
    const svg = d3.select('#graph-container')
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .style('background-color', '#f8f9fa');
    
    // Add a title
    svg.append('text')
        .attr('x', '50%')
        .attr('y', '50%')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .style('font-size', '20px')
        .style('fill', '#333')
        .text('Interactive Financial Visualization');
    
    console.log('Dashboard initialized successfully');
}