# Phase 1: Project Setup & Infrastructure

## Overview
This phase establishes the foundational infrastructure for the Budget Tool MVP. It involves setting up the development environment, creating the project structure, configuring Docker containers, and establishing the basic communication between frontend and backend services.

## Duration
1 week (Week 1)

## Objectives
- Create a fully functional development environment using Docker
- Establish the project repository structure
- Set up the basic FastAPI backend with health checks
- Initialize the SvelteKit frontend application
- Configure Docker Compose for orchestration
- Enable frontend-backend communication

## Deliverables

### 1. Repository Structure
Complete project directory structure with all necessary configuration files:
```
budget-tool/
├── api/
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── ledger/
│   ├── tests/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── routes/
│   │   ├── lib/
│   │   │   ├── api/
│   │   │   └── components/
│   │   ├── app.html
│   │   └── app.css
│   ├── static/
│   ├── tests/
│   ├── Dockerfile
│   ├── package.json
│   ├── svelte.config.js
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── .env.example
├── docker-compose.yml
├── docker-compose.dev.yml
├── volumes/
│   └── ledger/
├── .gitignore
├── .github/
│   └── workflows/
│       └── tests.yml
└── README.md
```

### 2. Backend API Foundation

#### Core Setup
- FastAPI application with proper project structure
- CORS middleware configured for frontend communication
- Environment variable configuration
- Logging setup with appropriate levels
- Error handling middleware
- Request/response validation

#### Initial Endpoints
- `GET /` - Root endpoint with API information
- `GET /health` - Health check endpoint
- `GET /api/v1/status` - Detailed status information

#### Testing Setup
- pytest configuration
- Test directory structure
- First passing tests for health endpoints
- Test coverage configuration

### 3. Frontend Foundation

#### Core Setup
- SvelteKit application initialized
- TypeScript configuration
- Tailwind CSS configured and working
- Environment variable handling
- API client service structure

#### Initial Features
- Basic layout/shell component
- Home route
- API connection test
- Loading states pattern established
- Error handling pattern established

#### Testing Setup
- Vitest configuration
- Playwright configuration
- Test directory structure
- First passing component test
- First passing E2E test

### 4. Docker Configuration

#### Dockerfiles
- **API Dockerfile**
  - Python 3.14 base image
  - Multi-stage build for optimization
  - Non-root user configuration
  - Health check command

- **Frontend Dockerfile**
  - Node.js base image
  - Multi-stage build (build + runtime)
  - Non-root user configuration
  - Static file serving setup

#### Docker Compose
- **docker-compose.yml** (production)
  - Service definitions (api, frontend)
  - Network configuration
  - Volume mounts for ledger data
  - Environment variable injection
  - Restart policies

- **docker-compose.dev.yml** (development)
  - Hot reload configuration
  - Volume mounts for source code
  - Debug port exposure
  - Development environment variables

### 5. Development Workflow

#### Git Configuration
- .gitignore with Python and Node.js patterns
- Branch protection rules documentation
- Commit message convention

#### CI/CD Foundation
- GitHub Actions workflow for tests
- Automated test runs on push
- Docker build verification

## Task Breakdown Structure

### Backend Tasks
1. **Project Initialization** (2 hours)
   - Create directory structure
   - Initialize Python virtual environment
   - Create requirements.txt with dependencies
   - Setup .env configuration

2. **FastAPI Setup** (4 hours)
   - Create main.py with FastAPI app
   - Configure CORS middleware
   - Setup logging
   - Create error handlers
   - Implement health endpoints

3. **Backend Testing Setup** (3 hours)
   - Configure pytest
   - Create test structure
   - Write health endpoint tests
   - Setup coverage reporting

4. **Backend Docker** (2 hours)
   - Create Dockerfile
   - Test container build
   - Verify health checks

### Frontend Tasks
1. **SvelteKit Initialization** (2 hours)
   - Create SvelteKit project
   - Configure TypeScript
   - Setup project structure
   - Configure environment variables

2. **Tailwind Setup** (2 hours)
   - Install and configure Tailwind
   - Create base styles
   - Setup component styling patterns

3. **API Client** (3 hours)
   - Create API service structure
   - Implement fetch wrapper
   - Add error handling
   - Test API connection

4. **Frontend Testing Setup** (3 hours)
   - Configure Vitest
   - Configure Playwright
   - Write first component test
   - Write first E2E test

5. **Frontend Docker** (2 hours)
   - Create Dockerfile
   - Configure build process
   - Test container

### Infrastructure Tasks
1. **Docker Compose** (3 hours)
   - Create docker-compose.yml
   - Create docker-compose.dev.yml
   - Configure networking
   - Setup volumes
   - Test orchestration

2. **CI/CD Setup** (2 hours)
   - Create GitHub Actions workflow
   - Configure test automation
   - Verify workflow execution

3. **Documentation** (2 hours)
   - Write README
   - Document setup instructions
   - Create development guide

## Success Criteria

### Functional Requirements
- [ ] Docker Compose brings up all services successfully
- [ ] Frontend can communicate with backend API
- [ ] Health check endpoints return 200 OK
- [ ] Hot reload works in development mode
- [ ] All tests pass (backend and frontend)

### Technical Requirements
- [ ] Backend serves at http://localhost:8000
- [ ] Frontend serves at http://localhost:3000
- [ ] API documentation available at /docs
- [ ] Test coverage reporting works
- [ ] Logs are properly formatted and accessible
- [ ] Environment variables are correctly injected

### Development Experience
- [ ] Changes to source code trigger hot reload
- [ ] Tests can be run with single command
- [ ] Clear error messages in development
- [ ] Docker builds complete in under 2 minutes

## Dependencies
- Docker and Docker Compose installed
- Node.js 20+ (for local development)
- Python 3.14+ (for local development)
- Git

## Risks and Mitigations

### Risk 1: Docker Configuration Complexity
**Risk**: Complex Docker networking or volume permissions issues
**Mitigation**: Start with simple configuration, test on multiple platforms, document platform-specific issues

### Risk 2: CORS Configuration
**Risk**: Frontend-backend communication blocked by CORS
**Mitigation**: Configure permissive CORS for development, document production settings

### Risk 3: Environment Variable Management
**Risk**: Confusion between development and production configurations
**Mitigation**: Clear .env.example files, validation on startup, comprehensive documentation

## Notes for Task Breakdown
When breaking this phase into smaller tasks:
1. Group related items (e.g., all Docker tasks together)
2. Ensure each task is 1-4 hours of work
3. Define clear acceptance criteria for each task
4. Identify task dependencies
5. Consider parallel work opportunities
6. Include testing in each task where applicable
7. Add documentation requirements to each task

## Phase Completion Checklist
- [ ] All services start successfully with docker-compose up
- [ ] Health endpoints responding
- [ ] Frontend displays test page
- [ ] API documentation accessible
- [ ] All tests passing
- [ ] Development workflow documented
- [ ] README completed
- [ ] Code committed to repository
- [ ] Team walkthrough completed