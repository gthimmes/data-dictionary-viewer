# Data Dictionary Viewer

A clean, modern static site for visualizing YAML data dictionaries.

## Features

- **Drag-and-drop YAML loading** - Just drop your data dictionary file onto the page
- **Automatic table categorization**:
  - 🟢 **Core entities** - Tables with many incoming FK references (client, staff, invoice, etc.)
  - 🟠 **Junction/Linker tables** - Tables that join other tables together
  - 🟣 **Config/Lookup tables** - Small reference tables (types, statuses, settings)
- **Search & filter** - Find tables quickly by name or category
- **Detailed column view** - See all columns with types, nullability, and descriptions
- **Relationship visualization** - See which tables reference which
- **Interactive ERD view** - Visual diagram of table relationships

## Usage

1. Open `index.html` in a browser
2. Drag and drop a YAML data dictionary file, or click "Choose File"
3. Browse tables in the sidebar, click to see details
4. Use the search box and category filters to find tables
5. Click "Relationships" tab to see a visual diagram

## YAML Format

The viewer expects YAML files in this format:

```yaml
data_dictionary:
  metadata:
    database: "my_database"
    schema: "public"
    total_tables: 50
    description: "My database"
  
  tables:
    my_table:
      description: "Description of the table"
      business_context: "Why this table exists"
      columns:
        - name: id
          type: integer
          nullable: false
          description: "Primary key"
        - name: other_table_id
          type: integer
          nullable: true
          description: "FK to other_table"
```

FK relationships are detected from column descriptions containing "FK to <table_name>".

## Files

- `index.html` - The viewer (standalone, works offline)
- `data-dictionary.yaml` - Sample data dictionary (280 tables)

## Tech Stack

- Vanilla JavaScript
- CSS (custom dark theme)
- js-yaml for YAML parsing (loaded from CDN)
- Canvas API for ERD visualization
