# Budget Tool - Product Description Document

## Executive Summary

Budget Tool is a self-hosted, open-source envelope budgeting application that empowers users to manage their personal finances using the proven envelope budgeting method combined with plain text accounting principles. The system provides a modern web interface for categorizing transactions, managing budget envelopes, and tracking financial goals while maintaining data in a human-readable, portable ledger format compatible with hledger/ledger tools.

## Product Vision & Goals

### Primary Objectives
- Provide a user-friendly interface for envelope-based budgeting
- Maintain financial data in an open, portable plain text format
- Enable self-hosting for complete data ownership and privacy
- Streamline transaction categorization from bank CSV imports
- Automate budget envelope management based on user-defined rules

### Target Users
- Privacy-conscious individuals seeking control over their financial data
- Users familiar with or interested in plain text accounting
- People who prefer envelope budgeting methodology
- Technical users comfortable with self-hosting applications

## System Architecture

### High-Level Architecture
- **Backend API**: Python-based REST API using FastAPI framework
- **Frontend**: SvelteKit-based single-page application with Tailwind CSS
- **Data Storage**: Plain text ledger files (hledger/ledger compatible format)
- **Deployment**: Docker containers orchestrated via Docker Compose
- **Communication**: RESTful API over HTTP/HTTPS

### Technology Stack

#### Backend
- Language: Python 3.x
- Framework: FastAPI
- Data Format: Plain text accounting (hledger/ledger compatible)
- Containerization: Docker

#### Frontend
- Framework: SvelteKit
- Styling: Tailwind CSS
- Build System: Vite
- Containerization: Docker (Node.js based)

#### Infrastructure
- Orchestration: Docker Compose
- Volumes: Persistent storage for ledger files
- Networking: Internal Docker network for service communication

## Core Features & Functionality

### 1. Envelope Management

#### Envelope Types
- **Monthly Budget Envelopes**: Recurring monthly expenses (e.g., petrol, utilities)
- **Annual Payment Envelopes**: Yearly expenses (e.g., taxes, annual licenses)
- **Goal-Based Envelopes**: One-off savings goals or rainy day funds
- **Default Cash Envelope**: Primary envelope for incoming funds

#### Envelope Operations
- Create, edit, and delete envelopes
- Set envelope goals (amount targets)
- Define envelope schedules (monthly, annual, one-time)
- View envelope balances and history
- Archive/deactivate envelopes

### 2. Transaction Management

#### CSV Import
- Upload bank transaction CSV files
- Support for multiple bank formats (configurable mapping)
- Duplicate detection and handling
- Batch import capabilities

#### Transaction Processing
- Sequential transaction presentation for categorization
- Single envelope allocation
- Multi-split transaction capability
- Ability to allocate splits to different envelopes
- Transaction editing and recategorization
- Transaction search and filtering

### 3. Fund Management

#### Inter-Envelope Transfers
- Move funds between envelopes
- Bulk transfer capabilities
- Transfer history and audit trail

#### Automated Funding
- Auto-fill monthly budget envelopes
- Graduated funding for annual goals
- Rules-based allocation from Cash envelope
- Scheduled transfer execution

### 4. Reporting & Visualization

#### Month-by-Month View
- Current month envelope status dashboard
- Historical month navigation
- Month-over-month comparison
- Budget vs. actual analysis

#### Envelope Analytics
- Envelope balance trends
- Spending patterns by category
- Goal progress tracking
- Underfunded envelope alerts

### 5. Data Management

#### Plain Text Accounting
- Human-readable ledger file format
- hledger/ledger tool compatibility
- Direct file access capability
- Version control friendly format

#### Import/Export
- CSV transaction import
- Ledger file export
- Backup and restore functionality
- Data migration tools

## User Workflows

### Initial Setup Flow
1. Deploy application via Docker Compose
2. Access web interface
3. Create initial envelope structure
4. Define budget goals and schedules
5. Configure bank CSV format mappings

### Regular Usage Flow
1. Export transactions from bank (CSV)
2. Upload CSV to Budget Tool
3. Review and categorize each transaction
4. System updates envelope balances
5. Review month-by-month budget status
6. Adjust envelope allocations as needed

### Monthly Budget Cycle
1. Start of month: Review upcoming expenses
2. Allocate funds from Cash to budget envelopes
3. Process transactions throughout the month
4. End of month: Review spending vs. budget
5. Carry forward or adjust for next month

## Non-Functional Requirements

### Performance
- Support for thousands of transactions
- Sub-second response times for typical operations
- Efficient handling of large CSV imports
- Optimized ledger file parsing and writing

### Security
- Self-hosted for complete data control
- No external data transmission
- Secure file storage permissions
- Optional authentication mechanisms
- HTTPS support for production deployments

### Usability
- Intuitive, modern web interface
- Mobile-responsive design
- Keyboard navigation support
- Clear error messages and validation
- Undo/redo capabilities for critical operations

### Reliability
- Data consistency in ledger files
- Atomic transaction operations
- Backup mechanisms
- Graceful error handling
- Recovery from interrupted operations

### Maintainability
- Clean, documented codebase
- Modular architecture
- Comprehensive API documentation
- Unit and integration testing
- Docker-based deployment simplicity

## Data Model Concepts

### Core Entities
- **Envelope**: Budget category with balance, goal, and schedule
- **Transaction**: Financial movement with date, amount, and description
- **Split**: Portion of a transaction allocated to an envelope
- **Transfer**: Movement of funds between envelopes
- **Import Session**: Batch of imported transactions

### Ledger File Structure
- Double-entry bookkeeping format
- Account hierarchies for envelopes
- Transaction entries with metadata
- Comments for additional context
- Compatible with standard ledger tools

## Deployment & Operations

### Deployment Requirements
- Docker and Docker Compose installation
- Persistent volume for ledger files
- Network access for web interface
- Optional reverse proxy for HTTPS

### Configuration
- Environment variables for service configuration
- Volume mounts for data persistence
- Port mapping for web access
- Optional authentication setup

### Monitoring & Maintenance
- Application logs via Docker
- Ledger file backup strategies
- Update mechanism via Docker images
- Data migration for version upgrades

## Success Criteria

### Functional Success
- Complete envelope budgeting workflow implementation
- Accurate transaction categorization and splitting
- Reliable ledger file generation and maintenance
- Seamless CSV import from major banks

### Technical Success
- Stable Docker-based deployment
- Fast, responsive web interface
- Valid hledger/ledger compatible output
- Clean separation of frontend and backend

### User Experience Success
- Intuitive transaction categorization process
- Clear month-by-month budget visibility
- Efficient envelope management
- Minimal manual data entry

## Future Considerations

### Potential Enhancements
- Multi-user support with permissions
- Mobile native applications
- Advanced reporting and analytics
- Automated transaction categorization (ML)
- Direct bank API integrations
- Budget templates and presets
- Recurring transaction detection

### Integration Opportunities
- Webhook notifications
- Export to other accounting software
- Integration with existing ledger workflows
- Command-line interface for power users

## Constraints & Assumptions

### Technical Constraints
- Must maintain hledger/ledger compatibility
- No external database dependencies
- Self-contained Docker deployment
- Plain text data storage only

### Business Assumptions
- Users have basic technical competence for self-hosting
- Users can obtain bank transactions in CSV format
- Single-user or family use case (not multi-tenant)
- English language interface (initially)

## Risk Considerations

### Technical Risks
- Ledger file corruption or inconsistency
- Performance degradation with large datasets
- CSV format compatibility issues
- Docker environment complexities

### Mitigation Strategies
- Comprehensive file validation and backup
- Performance testing and optimization
- Configurable CSV import mappings
- Clear deployment documentation and scripts

---

This product description document provides the high-level overview necessary for a software team to understand the scope, complexity, and requirements of the Budget Tool project. It establishes the foundation for detailed technical specifications, project planning, and development efforts.