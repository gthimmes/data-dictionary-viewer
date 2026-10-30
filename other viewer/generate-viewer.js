/**
 * Data Dictionary Viewer Generator
 *
 * Reads data-dictionary.yaml, parses it, infers FK relationships,
 * and generates a single static HTML file for visualization.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Read and parse the YAML file
const yamlPath = path.join(__dirname, 'data-dictionary.yaml');
const yamlContent = fs.readFileSync(yamlPath, 'utf8');
const data = yaml.parse(yamlContent);

const tables = data.data_dictionary.tables;
const metadata = data.data_dictionary.metadata;

// Infer FK relationships from column naming patterns
function inferForeignKeys(tables) {
    const tableNames = new Set(Object.keys(tables));
    const relationships = [];
    const referencedBy = {}; // Map of table -> tables that reference it

    // Initialize referencedBy for all tables
    for (const tableName of tableNames) {
        referencedBy[tableName] = [];
    }

    for (const [tableName, tableData] of Object.entries(tables)) {
        if (!tableData.columns) continue;

        for (const column of tableData.columns) {
            // Skip primary key id columns
            if (column.name === 'id') continue;

            // Check if column ends with _id
            if (column.name.endsWith('_id')) {
                // Extract potential target table name
                let targetTable = column.name.slice(0, -3); // Remove '_id'

                // Handle special patterns
                // *_staff_id -> staff
                if (targetTable.endsWith('_staff')) {
                    targetTable = 'staff';
                }
                // *_contact_id -> contact
                else if (targetTable.endsWith('_contact')) {
                    targetTable = 'contact';
                }
                // *_client_id -> client
                else if (targetTable.endsWith('_client')) {
                    targetTable = 'client';
                }
                // Check for compound names like billing_contact_id -> contact
                else if (targetTable.includes('_')) {
                    // Try the last part first
                    const parts = targetTable.split('_');
                    const lastPart = parts[parts.length - 1];
                    if (tableNames.has(lastPart)) {
                        targetTable = lastPart;
                    }
                }

                // Verify target table exists
                if (tableNames.has(targetTable)) {
                    relationships.push({
                        from: tableName,
                        to: targetTable,
                        column: column.name
                    });

                    // Track reverse relationship
                    if (!referencedBy[targetTable].includes(tableName)) {
                        referencedBy[targetTable].push(tableName);
                    }
                }
            }
        }
    }

    return { relationships, referencedBy };
}

const { relationships, referencedBy } = inferForeignKeys(tables);

// Convert data to JSON for embedding
const dataForEmbed = {
    metadata,
    tables: Object.entries(tables).map(([name, data]) => ({
        name,
        description: data.description || '',
        business_context: data.business_context || '',
        columns: data.columns || [],
        referencedBy: referencedBy[name] || []
    })),
    relationships
};

// Generate the HTML file
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Dictionary Viewer - ${metadata.database}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.6/dist/vis-network.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #f5f7fa;
            color: #333;
            line-height: 1.5;
        }

        /* Header */
        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%);
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            gap: 20px;
            flex-wrap: wrap;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }

        .header h1 {
            font-size: 1.4rem;
            font-weight: 600;
        }

        .header-meta {
            font-size: 0.85rem;
            opacity: 0.9;
        }

        .search-box {
            flex: 1;
            min-width: 200px;
            max-width: 400px;
        }

        .search-box input {
            width: 100%;
            padding: 10px 15px;
            border: none;
            border-radius: 25px;
            font-size: 0.95rem;
            outline: none;
        }

        .search-box input:focus {
            box-shadow: 0 0 0 3px rgba(255,255,255,0.3);
        }

        .header-buttons {
            display: flex;
            gap: 10px;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .btn-primary {
            background: white;
            color: #2c3e50;
        }

        .btn-primary:hover {
            background: #ecf0f1;
        }

        .btn-secondary {
            background: rgba(255,255,255,0.2);
            color: white;
        }

        .btn-secondary:hover {
            background: rgba(255,255,255,0.3);
        }

        /* Filter Panel */
        .filter-panel {
            background: white;
            padding: 15px 20px;
            border-bottom: 1px solid #e1e5eb;
            display: none;
            flex-wrap: wrap;
            gap: 15px;
            align-items: center;
        }

        .filter-panel.show {
            display: flex;
        }

        .filter-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .filter-group label {
            font-size: 0.85rem;
            color: #666;
            font-weight: 500;
        }

        .filter-group select,
        .filter-group input[type="text"] {
            padding: 6px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 0.9rem;
        }

        .filter-group input[type="checkbox"] {
            width: 16px;
            height: 16px;
        }

        .filter-clear {
            color: #e74c3c;
            cursor: pointer;
            font-size: 0.85rem;
        }

        /* Main Layout */
        .main-container {
            display: grid;
            grid-template-columns: 280px 1fr;
            height: calc(100vh - 60px);
        }

        /* Sidebar */
        .sidebar {
            background: white;
            border-right: 1px solid #e1e5eb;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }

        .sidebar-header {
            padding: 15px;
            border-bottom: 1px solid #e1e5eb;
            font-weight: 600;
            color: #2c3e50;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            background: white;
            z-index: 10;
        }

        .table-count {
            background: #3498db;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
        }

        .table-list {
            flex: 1;
            overflow-y: auto;
        }

        .table-item {
            padding: 10px 15px;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
            transition: background 0.2s;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .table-item:hover {
            background: #f8f9fa;
        }

        .table-item.active {
            background: #e3f2fd;
            border-left: 3px solid #3498db;
        }

        .table-item-name {
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.9rem;
            color: #2c3e50;
        }

        .table-item-badge {
            background: #ecf0f1;
            color: #7f8c8d;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.75rem;
        }

        .table-item-badge.has-fk {
            background: #d5f5e3;
            color: #27ae60;
        }

        /* Content Area */
        .content {
            overflow-y: auto;
            padding: 20px;
            background: #f5f7fa;
        }

        .welcome-message {
            text-align: center;
            padding: 60px 20px;
            color: #7f8c8d;
        }

        .welcome-message h2 {
            font-size: 1.5rem;
            margin-bottom: 10px;
            color: #2c3e50;
        }

        .table-detail {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            overflow: hidden;
        }

        .table-header {
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            color: white;
            padding: 20px;
        }

        .table-header h2 {
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 1.5rem;
            margin-bottom: 10px;
        }

        .table-header p {
            opacity: 0.9;
            font-size: 0.95rem;
        }

        .table-header .business-context {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(255,255,255,0.2);
            font-style: italic;
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .section {
            padding: 20px;
            border-bottom: 1px solid #e1e5eb;
        }

        .section:last-child {
            border-bottom: none;
        }

        .section-title {
            font-size: 0.9rem;
            font-weight: 600;
            color: #7f8c8d;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 15px;
        }

        /* Columns Table */
        .columns-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
        }

        .columns-table th {
            text-align: left;
            padding: 10px 12px;
            background: #f8f9fa;
            color: #2c3e50;
            font-weight: 600;
            border-bottom: 2px solid #e1e5eb;
        }

        .columns-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #f0f0f0;
            vertical-align: top;
        }

        .columns-table tr:hover {
            background: #f8f9fa;
        }

        .column-name {
            font-family: 'Monaco', 'Consolas', monospace;
            color: #2c3e50;
            font-weight: 500;
        }

        .column-type {
            font-family: 'Monaco', 'Consolas', monospace;
            color: #8e44ad;
            font-size: 0.85rem;
        }

        .nullable-yes {
            color: #27ae60;
        }

        .nullable-no {
            color: #e74c3c;
            font-weight: 600;
        }

        .fk-link {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            color: #3498db;
            cursor: pointer;
            font-size: 0.85rem;
        }

        .fk-link:hover {
            text-decoration: underline;
        }

        /* Referenced By */
        .ref-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .ref-tag {
            background: #e3f2fd;
            color: #1976d2;
            padding: 4px 10px;
            border-radius: 4px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s;
        }

        .ref-tag:hover {
            background: #bbdefb;
        }

        /* Modal */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 200;
            justify-content: center;
            align-items: center;
        }

        .modal-overlay.show {
            display: flex;
        }

        .modal {
            background: white;
            border-radius: 8px;
            width: 90vw;
            height: 85vh;
            max-width: 1400px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .modal-header {
            padding: 15px 20px;
            border-bottom: 1px solid #e1e5eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-header h3 {
            color: #2c3e50;
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #7f8c8d;
        }

        .modal-body {
            flex: 1;
            overflow: hidden;
        }

        #diagram-container {
            width: 100%;
            height: 100%;
        }

        .modal-controls {
            padding: 10px 20px;
            border-top: 1px solid #e1e5eb;
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .modal-controls label {
            font-size: 0.9rem;
            color: #666;
        }

        /* Export Dropdown */
        .dropdown {
            position: relative;
        }

        .dropdown-menu {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            background: white;
            border-radius: 5px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            min-width: 180px;
            z-index: 50;
            margin-top: 5px;
        }

        .dropdown.show .dropdown-menu {
            display: block;
        }

        .dropdown-item {
            padding: 10px 15px;
            cursor: pointer;
            font-size: 0.9rem;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .dropdown-item:hover {
            background: #f8f9fa;
        }

        .dropdown-item:first-child {
            border-radius: 5px 5px 0 0;
        }

        .dropdown-item:last-child {
            border-radius: 0 0 5px 5px;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .main-container {
                grid-template-columns: 1fr;
            }

            .sidebar {
                display: none;
            }

            .header {
                flex-direction: column;
                align-items: stretch;
            }

            .search-box {
                max-width: none;
            }
        }

        /* Print Styles */
        @media print {
            .header, .sidebar, .modal-overlay {
                display: none !important;
            }

            .main-container {
                display: block;
            }

            .content {
                padding: 0;
            }

            .table-detail {
                box-shadow: none;
                break-inside: avoid;
            }
        }

        /* Loading spinner */
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 40px;
        }

        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Stats bar */
        .stats-bar {
            background: #ecf0f1;
            padding: 8px 15px;
            font-size: 0.85rem;
            color: #7f8c8d;
            border-bottom: 1px solid #e1e5eb;
        }

        .stats-bar span {
            margin-right: 20px;
        }

        /* No results */
        .no-results {
            text-align: center;
            padding: 40px 20px;
            color: #7f8c8d;
        }

        /* Keyboard shortcuts hint */
        .shortcuts-hint {
            font-size: 0.8rem;
            color: rgba(255,255,255,0.7);
            margin-left: auto;
        }

        .shortcuts-hint kbd {
            background: rgba(255,255,255,0.2);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: inherit;
        }
    </style>
</head>
<body>
    <header class="header">
        <h1>Data Dictionary</h1>
        <div class="header-meta">${metadata.database} / ${metadata.schema}</div>
        <div class="search-box">
            <input type="text" id="searchInput" placeholder="Search tables, columns, descriptions...">
        </div>
        <div class="header-buttons">
            <button class="btn btn-secondary" id="filterToggle">
                <span>Filters</span>
            </button>
            <button class="btn btn-primary" id="diagramBtn">
                <span>Diagram</span>
            </button>
            <div class="dropdown" id="exportDropdown">
                <button class="btn btn-secondary" id="exportBtn">
                    <span>Export</span>
                </button>
                <div class="dropdown-menu">
                    <div class="dropdown-item" id="exportPdf">Export to PDF</div>
                    <div class="dropdown-item" id="exportMd">Export to Markdown</div>
                    <div class="dropdown-item" id="copyClipboard">Copy Current Table</div>
                </div>
            </div>
        </div>
        <div class="shortcuts-hint">
            <kbd>/</kbd> Search &nbsp; <kbd>Esc</kbd> Close
        </div>
    </header>

    <div class="filter-panel" id="filterPanel">
        <div class="filter-group">
            <label>Type:</label>
            <select id="filterType">
                <option value="">All Types</option>
                <option value="integer">integer</option>
                <option value="bigint">bigint</option>
                <option value="text">text</option>
                <option value="boolean">boolean</option>
                <option value="timestamp">timestamp</option>
                <option value="jsonb">jsonb</option>
                <option value="numeric">numeric</option>
                <option value="date">date</option>
            </select>
        </div>
        <div class="filter-group">
            <label>Nullable:</label>
            <select id="filterNullable">
                <option value="">Any</option>
                <option value="true">Nullable</option>
                <option value="false">Not Nullable</option>
            </select>
        </div>
        <div class="filter-group">
            <input type="checkbox" id="filterHasFk">
            <label for="filterHasFk">Has Foreign Keys</label>
        </div>
        <div class="filter-group">
            <input type="checkbox" id="filterIsReferenced">
            <label for="filterIsReferenced">Is Referenced</label>
        </div>
        <span class="filter-clear" id="clearFilters">Clear Filters</span>
    </div>

    <div class="main-container">
        <aside class="sidebar">
            <div class="sidebar-header">
                <span>Tables</span>
                <span class="table-count" id="tableCount">${dataForEmbed.tables.length}</span>
            </div>
            <div class="table-list" id="tableList">
                <!-- Tables will be rendered here -->
            </div>
        </aside>

        <main class="content" id="content">
            <div class="welcome-message">
                <h2>Welcome to the Data Dictionary</h2>
                <p>Select a table from the sidebar to view its details, or use the search to find specific tables and columns.</p>
                <p style="margin-top: 15px; font-size: 0.9rem;">
                    <strong>${dataForEmbed.tables.length}</strong> tables |
                    <strong>${dataForEmbed.relationships.length}</strong> inferred relationships
                </p>
            </div>
        </main>
    </div>

    <!-- Diagram Modal -->
    <div class="modal-overlay" id="diagramModal">
        <div class="modal">
            <div class="modal-header">
                <h3>Table Relationships Diagram</h3>
                <button class="modal-close" id="closeDiagram">&times;</button>
            </div>
            <div class="modal-body">
                <div id="diagram-container"></div>
            </div>
            <div class="modal-controls">
                <label>
                    <input type="checkbox" id="showAllTables" checked> Show all tables
                </label>
                <label>
                    <input type="checkbox" id="showLabels" checked> Show relationship labels
                </label>
                <button class="btn btn-primary" id="fitDiagram">Fit to View</button>
            </div>
        </div>
    </div>

    <script>
        // Embedded data dictionary
        const DATA = ${JSON.stringify(dataForEmbed, null, 2)};

        // Application state
        const state = {
            selectedTable: null,
            searchQuery: '',
            filters: {
                type: '',
                nullable: '',
                hasFk: false,
                isReferenced: false
            },
            network: null
        };

        // DOM Elements
        const elements = {
            searchInput: document.getElementById('searchInput'),
            tableList: document.getElementById('tableList'),
            tableCount: document.getElementById('tableCount'),
            content: document.getElementById('content'),
            filterPanel: document.getElementById('filterPanel'),
            filterToggle: document.getElementById('filterToggle'),
            filterType: document.getElementById('filterType'),
            filterNullable: document.getElementById('filterNullable'),
            filterHasFk: document.getElementById('filterHasFk'),
            filterIsReferenced: document.getElementById('filterIsReferenced'),
            clearFilters: document.getElementById('clearFilters'),
            diagramModal: document.getElementById('diagramModal'),
            diagramBtn: document.getElementById('diagramBtn'),
            closeDiagram: document.getElementById('closeDiagram'),
            exportDropdown: document.getElementById('exportDropdown'),
            exportBtn: document.getElementById('exportBtn'),
            exportPdf: document.getElementById('exportPdf'),
            exportMd: document.getElementById('exportMd'),
            copyClipboard: document.getElementById('copyClipboard'),
            showAllTables: document.getElementById('showAllTables'),
            showLabels: document.getElementById('showLabels'),
            fitDiagram: document.getElementById('fitDiagram')
        };

        // Build FK lookup maps
        const fkByTable = {};
        const fkTargets = new Set();
        DATA.relationships.forEach(rel => {
            if (!fkByTable[rel.from]) fkByTable[rel.from] = [];
            fkByTable[rel.from].push(rel);
            fkTargets.add(rel.to);
        });

        // Debounce function
        function debounce(fn, delay) {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn(...args), delay);
            };
        }

        // Filter tables based on current state
        function getFilteredTables() {
            return DATA.tables.filter(table => {
                // Search filter
                if (state.searchQuery) {
                    const query = state.searchQuery.toLowerCase();
                    const matchesName = table.name.toLowerCase().includes(query);
                    const matchesDesc = (table.description || '').toLowerCase().includes(query);
                    const matchesColumn = table.columns.some(col =>
                        col.name.toLowerCase().includes(query) ||
                        (col.description || '').toLowerCase().includes(query)
                    );
                    if (!matchesName && !matchesDesc && !matchesColumn) return false;
                }

                // Type filter
                if (state.filters.type) {
                    const hasType = table.columns.some(col =>
                        col.type.toLowerCase().includes(state.filters.type.toLowerCase())
                    );
                    if (!hasType) return false;
                }

                // Nullable filter
                if (state.filters.nullable !== '') {
                    const targetNullable = state.filters.nullable === 'true';
                    const hasNullable = table.columns.some(col => col.nullable === targetNullable);
                    if (!hasNullable) return false;
                }

                // Has FK filter
                if (state.filters.hasFk) {
                    if (!fkByTable[table.name] || fkByTable[table.name].length === 0) return false;
                }

                // Is Referenced filter
                if (state.filters.isReferenced) {
                    if (!table.referencedBy || table.referencedBy.length === 0) return false;
                }

                return true;
            });
        }

        // Render table list
        function renderTableList() {
            const filtered = getFilteredTables();
            elements.tableCount.textContent = filtered.length;

            if (filtered.length === 0) {
                elements.tableList.innerHTML = '<div class="no-results">No tables match your criteria</div>';
                return;
            }

            elements.tableList.innerHTML = filtered.map(table => {
                const fks = fkByTable[table.name] || [];
                const isActive = state.selectedTable === table.name;
                const badgeClass = fks.length > 0 ? 'has-fk' : '';

                return \`
                    <div class="table-item \${isActive ? 'active' : ''}" data-table="\${table.name}">
                        <span class="table-item-name">\${table.name}</span>
                        \${fks.length > 0 ? \`<span class="table-item-badge \${badgeClass}">\${fks.length} FK</span>\` : ''}
                    </div>
                \`;
            }).join('');

            // Add click handlers
            elements.tableList.querySelectorAll('.table-item').forEach(item => {
                item.addEventListener('click', () => {
                    selectTable(item.dataset.table);
                });
            });
        }

        // Select and display table details
        function selectTable(tableName) {
            state.selectedTable = tableName;
            const table = DATA.tables.find(t => t.name === tableName);

            if (!table) return;

            const fks = fkByTable[tableName] || [];
            const fkColumns = new Set(fks.map(fk => fk.column));
            const fkTargetMap = {};
            fks.forEach(fk => fkTargetMap[fk.column] = fk.to);

            elements.content.innerHTML = \`
                <div class="table-detail" id="tableDetail">
                    <div class="table-header">
                        <h2>\${table.name}</h2>
                        <p>\${table.description || 'No description available'}</p>
                        \${table.business_context ? \`<div class="business-context">\${table.business_context}</div>\` : ''}
                    </div>

                    <div class="section">
                        <h3 class="section-title">Columns (\${table.columns.length})</h3>
                        <table class="columns-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Nullable</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${table.columns.map(col => \`
                                    <tr>
                                        <td>
                                            <span class="column-name">\${col.name}</span>
                                            \${fkColumns.has(col.name) ? \`
                                                <br><span class="fk-link" data-table="\${fkTargetMap[col.name]}">
                                                    &#8594; \${fkTargetMap[col.name]}
                                                </span>
                                            \` : ''}
                                        </td>
                                        <td><span class="column-type">\${col.type}</span></td>
                                        <td class="\${col.nullable ? 'nullable-yes' : 'nullable-no'}">
                                            \${col.nullable ? 'Yes' : 'No'}
                                        </td>
                                        <td>\${col.description || ''}</td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    </div>

                    \${table.referencedBy && table.referencedBy.length > 0 ? \`
                        <div class="section">
                            <h3 class="section-title">Referenced By (\${table.referencedBy.length} tables)</h3>
                            <div class="ref-tags">
                                \${table.referencedBy.map(ref => \`
                                    <span class="ref-tag" data-table="\${ref}">\${ref}</span>
                                \`).join('')}
                            </div>
                        </div>
                    \` : ''}
                </div>
            \`;

            // Add FK link handlers
            elements.content.querySelectorAll('.fk-link, .ref-tag').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectTable(link.dataset.table);
                });
            });

            // Update sidebar selection
            renderTableList();
        }

        // Initialize diagram
        function initDiagram() {
            const container = document.getElementById('diagram-container');

            // Create nodes
            const nodes = new vis.DataSet(
                DATA.tables.map(table => ({
                    id: table.name,
                    label: table.name,
                    shape: 'box',
                    color: {
                        background: fkTargets.has(table.name) ? '#d5f5e3' : '#e3f2fd',
                        border: fkTargets.has(table.name) ? '#27ae60' : '#3498db',
                        highlight: {
                            background: '#fff3cd',
                            border: '#ffc107'
                        }
                    },
                    font: { size: 12 }
                }))
            );

            // Create edges
            const edges = new vis.DataSet(
                DATA.relationships.map((rel, idx) => ({
                    id: idx,
                    from: rel.from,
                    to: rel.to,
                    label: elements.showLabels.checked ? rel.column : '',
                    arrows: 'to',
                    color: { color: '#95a5a6' },
                    font: { size: 10, color: '#7f8c8d' }
                }))
            );

            const options = {
                layout: {
                    improvedLayout: true,
                    hierarchical: false
                },
                physics: {
                    enabled: true,
                    solver: 'forceAtlas2Based',
                    forceAtlas2Based: {
                        gravitationalConstant: -50,
                        centralGravity: 0.01,
                        springLength: 100,
                        springConstant: 0.08
                    },
                    stabilization: {
                        iterations: 200
                    }
                },
                interaction: {
                    hover: true,
                    zoomView: true,
                    dragView: true
                },
                nodes: {
                    margin: 10,
                    font: {
                        face: 'Monaco, Consolas, monospace'
                    }
                }
            };

            state.network = new vis.Network(container, { nodes, edges }, options);

            // Click handler
            state.network.on('click', params => {
                if (params.nodes.length > 0) {
                    const tableName = params.nodes[0];
                    closeDiagram();
                    selectTable(tableName);
                }
            });
        }

        function openDiagram() {
            elements.diagramModal.classList.add('show');
            if (!state.network) {
                setTimeout(initDiagram, 100);
            }
        }

        function closeDiagram() {
            elements.diagramModal.classList.remove('show');
        }

        // Export functions
        function exportToPdf() {
            const element = document.getElementById('tableDetail');
            if (!element) {
                alert('Please select a table first');
                return;
            }

            const opt = {
                margin: 10,
                filename: \`\${state.selectedTable || 'data-dictionary'}.pdf\`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(element).save();
        }

        function exportToMarkdown() {
            let md = \`# Data Dictionary - \${DATA.metadata.database}\\n\\n\`;
            md += \`Generated: \${DATA.metadata.generated_at}\\n\\n\`;
            md += \`Schema: \${DATA.metadata.schema}\\n\\n\`;
            md += \`---\\n\\n\`;

            DATA.tables.forEach(table => {
                md += \`## \${table.name}\\n\\n\`;
                if (table.description) md += \`\${table.description}\\n\\n\`;
                if (table.business_context) md += \`*\${table.business_context}*\\n\\n\`;

                md += \`| Column | Type | Nullable | Description |\\n\`;
                md += \`|--------|------|----------|-------------|\\n\`;

                table.columns.forEach(col => {
                    md += \`| \${col.name} | \${col.type} | \${col.nullable ? 'Yes' : 'No'} | \${col.description || ''} |\\n\`;
                });

                md += \`\\n\`;

                if (table.referencedBy && table.referencedBy.length > 0) {
                    md += \`**Referenced by:** \${table.referencedBy.join(', ')}\\n\\n\`;
                }

                md += \`---\\n\\n\`;
            });

            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'data-dictionary.md';
            a.click();
            URL.revokeObjectURL(url);
        }

        function copyToClipboard() {
            const table = DATA.tables.find(t => t.name === state.selectedTable);
            if (!table) {
                alert('Please select a table first');
                return;
            }

            let text = \`Table: \${table.name}\\n\`;
            text += \`Description: \${table.description || 'N/A'}\\n\\n\`;
            text += \`Columns:\\n\`;

            table.columns.forEach(col => {
                text += \`  - \${col.name} (\${col.type}, \${col.nullable ? 'nullable' : 'not null'})\`;
                if (col.description) text += \`: \${col.description}\`;
                text += \`\\n\`;
            });

            navigator.clipboard.writeText(text).then(() => {
                alert('Copied to clipboard!');
            });
        }

        // Event listeners
        elements.searchInput.addEventListener('input', debounce(() => {
            state.searchQuery = elements.searchInput.value;
            renderTableList();
        }, 200));

        elements.filterToggle.addEventListener('click', () => {
            elements.filterPanel.classList.toggle('show');
        });

        elements.filterType.addEventListener('change', () => {
            state.filters.type = elements.filterType.value;
            renderTableList();
        });

        elements.filterNullable.addEventListener('change', () => {
            state.filters.nullable = elements.filterNullable.value;
            renderTableList();
        });

        elements.filterHasFk.addEventListener('change', () => {
            state.filters.hasFk = elements.filterHasFk.checked;
            renderTableList();
        });

        elements.filterIsReferenced.addEventListener('change', () => {
            state.filters.isReferenced = elements.filterIsReferenced.checked;
            renderTableList();
        });

        elements.clearFilters.addEventListener('click', () => {
            state.filters = { type: '', nullable: '', hasFk: false, isReferenced: false };
            state.searchQuery = '';
            elements.searchInput.value = '';
            elements.filterType.value = '';
            elements.filterNullable.value = '';
            elements.filterHasFk.checked = false;
            elements.filterIsReferenced.checked = false;
            renderTableList();
        });

        elements.diagramBtn.addEventListener('click', openDiagram);
        elements.closeDiagram.addEventListener('click', closeDiagram);
        elements.diagramModal.addEventListener('click', (e) => {
            if (e.target === elements.diagramModal) closeDiagram();
        });

        elements.exportBtn.addEventListener('click', () => {
            elements.exportDropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!elements.exportDropdown.contains(e.target)) {
                elements.exportDropdown.classList.remove('show');
            }
        });

        elements.exportPdf.addEventListener('click', exportToPdf);
        elements.exportMd.addEventListener('click', exportToMarkdown);
        elements.copyClipboard.addEventListener('click', copyToClipboard);

        elements.fitDiagram.addEventListener('click', () => {
            if (state.network) state.network.fit();
        });

        elements.showLabels.addEventListener('change', () => {
            if (state.network) {
                state.network.destroy();
                state.network = null;
                initDiagram();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== elements.searchInput) {
                e.preventDefault();
                elements.searchInput.focus();
            }
            if (e.key === 'Escape') {
                if (elements.diagramModal.classList.contains('show')) {
                    closeDiagram();
                } else {
                    elements.searchInput.blur();
                }
            }
        });

        // Initialize
        renderTableList();
    </script>
</body>
</html>`;

// Write the HTML file
const outputPath = path.join(__dirname, 'data-dictionary-viewer.html');
fs.writeFileSync(outputPath, htmlContent, 'utf8');

console.log('Generated data-dictionary-viewer.html successfully!');
console.log(`  - ${Object.keys(tables).length} tables processed`);
console.log(`  - ${relationships.length} FK relationships inferred`);
console.log(`\nOpen ${outputPath} in a browser to view the data dictionary.`);
