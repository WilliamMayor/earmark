# Task 23: Set up GitHub Actions CI/CD Workflow

## Context
This task establishes continuous integration and deployment pipelines using GitHub Actions for the Budget Tool MVP. The CI/CD pipeline automates testing, building, and deployment processes to ensure code quality, catch issues early, and streamline the development workflow. This infrastructure is essential for maintaining code reliability and enabling rapid, safe deployments.

## Objectives
- Set up CI pipeline for automated testing on pull requests
- Configure CD pipeline for deployment on main branch merges
- Run unit, integration, and E2E tests automatically
- Build and push Docker images to registry
- Implement code quality checks and linting
- Set up security scanning for dependencies
- Configure automated release creation
- Enable deployment notifications

## Prerequisites
- GitHub repository created and code pushed
- Docker Hub or GitHub Container Registry account
- All test suites working locally
- Docker images building successfully
- Secrets management understanding
- Basic GitHub Actions knowledge

## Task Instructions

### Step 1: Create Main CI Workflow
Create `.github/workflows/ci.yml`:

```yaml
name: Continuous Integration

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

env:
  NODE_VERSION: '18'
  PYTHON_VERSION: '3.11'
  
jobs:
  # Backend Testing
  test-backend:
    name: Backend Tests
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      
      - name: Cache Python dependencies
        uses: actions/cache@v3
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements*.txt') }}
          restore-keys: |
            ${{ runner.os }}-pip-
      
      - name: Install dependencies
        run: |
          cd api
          pip install -r requirements.txt
          pip install -r requirements-dev.txt
      
      - name: Run linting
        run: |
          cd api
          flake8 app tests
          black --check app tests
          mypy app
      
      - name: Run unit tests
        run: |
          cd api
          pytest tests/unit --cov=app --cov-report=xml --cov-report=term
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./api/coverage.xml
          flags: backend
          name: backend-coverage
  
  # Frontend Testing
  test-frontend:
    name: Frontend Tests
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      
      - name: Run linting
        run: |
          cd frontend
          npm run lint
          npm run check
      
      - name: Run unit tests
        run: |
          cd frontend
          npm run test:unit
      
      - name: Build application
        run: |
          cd frontend
          npm run build
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: frontend-build
          path: frontend/build
  
  # Integration Tests
  test-integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Start services
        run: |
          docker-compose up -d
          ./scripts/wait-for-services.sh
      
      - name: Run integration tests
        run: |
          docker-compose exec -T api pytest tests/integration -v
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: integration-test-results
          path: test-results/
      
      - name: Stop services
        if: always()
        run: docker-compose down
  
  # E2E Tests
  test-e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      - name: Install Playwright
        run: |
          cd frontend
          npm ci
          npx playwright install --with-deps
      
      - name: Start services
        run: |
          docker-compose up -d
          ./scripts/wait-for-services.sh
      
      - name: Run E2E tests
        run: |
          cd frontend
          npx playwright test
      
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: frontend/playwright-report/
      
      - name: Stop services
        if: always()
        run: docker-compose down
```

### Step 2: Create CD Workflow
Create `.github/workflows/cd.yml`:

```yaml
name: Continuous Deployment

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    name: Build and Push Docker Images
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      
    outputs:
      version: ${{ steps.version.outputs.version }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Generate version
        id: version
        run: |
          VERSION=$(date +%Y%m%d)-${{ github.run_number }}-$(git rev-parse --short HEAD)
          echo "version=$VERSION" >> $GITHUB_OUTPUT
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: ./api
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/api:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/api:${{ steps.version.outputs.version }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Build and push Frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/frontend:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/frontend:${{ steps.version.outputs.version }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
  
  deploy:
    name: Deploy to Environment
    runs-on: ubuntu-latest
    needs: build-and-push
    environment:
      name: ${{ github.event.inputs.environment || 'staging' }}
      url: ${{ steps.deploy.outputs.url }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Deploy to staging
        if: github.event.inputs.environment != 'production'
        id: deploy
        run: |
          echo "Deploying version ${{ needs.build-and-push.outputs.version }} to staging"
          # Add actual deployment commands here
          echo "url=https://staging.budget-tool.example.com" >> $GITHUB_OUTPUT
      
      - name: Deploy to production
        if: github.event.inputs.environment == 'production'
        id: deploy-prod
        run: |
          echo "Deploying version ${{ needs.build-and-push.outputs.version }} to production"
          # Add actual deployment commands here
          echo "url=https://budget-tool.example.com" >> $GITHUB_OUTPUT
      
      - name: Smoke test deployment
        run: |
          URL=${{ steps.deploy.outputs.url || steps.deploy-prod.outputs.url }}
          curl -f $URL/health || exit 1
```

### Step 3: Create Security Scanning Workflow
Create `.github/workflows/security.yml`:

```yaml
name: Security Scanning

on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  dependency-scan:
    name: Dependency Security Scan
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Run Python dependency check
        uses: pyupio/safety@v1
        with:
          api-key: ${{ secrets.SAFETY_API_KEY }}
          scan: requirements.txt
          path: api/
      
      - name: Run npm audit
        run: |
          cd frontend
          npm audit --audit-level=moderate
      
      - name: Run Trivy security scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'
      
      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
  
  container-scan:
    name: Container Image Security Scan
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Build images
        run: |
          docker-compose build
      
      - name: Run Trivy on API image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'budget-tool-api:latest'
          format: 'table'
          exit-code: '1'
          ignore-unfixed: true
          vuln-type: 'os,library'
          severity: 'CRITICAL,HIGH'
      
      - name: Run Trivy on Frontend image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'budget-tool-frontend:latest'
          format: 'table'
          exit-code: '1'
          ignore-unfixed: true
          vuln-type: 'os,library'
          severity: 'CRITICAL,HIGH'
```

### Step 4: Create Release Workflow
Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  packages: write

jobs:
  create-release:
    name: Create Release
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Generate changelog
        id: changelog
        run: |
          PREVIOUS_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          if [ -z "$PREVIOUS_TAG" ]; then
            CHANGELOG=$(git log --pretty=format:"- %s (%h)" HEAD)
          else
            CHANGELOG=$(git log --pretty=format:"- %s (%h)" $PREVIOUS_TAG..HEAD)
          fi
          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          echo "$CHANGELOG" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          body: |
            ## Changes
            ${{ steps.changelog.outputs.changelog }}
            
            ## Docker Images
            - API: `ghcr.io/${{ github.repository }}/api:${{ github.ref_name }}`
            - Frontend: `ghcr.io/${{ github.repository }}/frontend:${{ github.ref_name }}`
            
            ## Deployment
            Follow the deployment guide in docs/DEPLOYMENT.md
          draft: false
          prerelease: ${{ contains(github.ref, 'rc') }}
          generate_release_notes: true
```

### Step 5: Create Code Quality Workflow
Create `.github/workflows/code-quality.yml`:

```yaml
name: Code Quality

on:
  pull_request:
    branches: [main, develop]

jobs:
  sonarcloud:
    name: SonarCloud Analysis
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
  
  code-review:
    name: Automated Code Review
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Run Code Climate
        uses: paambaati/codeclimate-action@v5.0.0
        env:
          CC_TEST_REPORTER_ID: ${{ secrets.CODE_CLIMATE_ID }}
        with:
          coverageCommand: |
            cd api && pytest --cov=app --cov-report=xml
          coverageLocations: |
            ${{github.workspace}}/api/coverage.xml:coverage.py
```

### Step 6: Create Workflow Utilities
Create `.github/workflows/scripts/wait-for-services.sh`:

```bash
#!/bin/bash

# Wait for services to be healthy

set -e

MAX_RETRIES=60
RETRY_INTERVAL=2

echo "Waiting for services to be healthy..."

for i in $(seq 1 $MAX_RETRIES); do
  if curl -f http://localhost:8000/health > /dev/null 2>&1 && \
     curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "Services are healthy!"
    exit 0
  fi
  
  echo "Attempt $i/$MAX_RETRIES: Services not ready yet..."
  sleep $RETRY_INTERVAL
done

echo "Services failed to become healthy within timeout"
exit 1
```

### Step 7: Create GitHub Actions Configuration
Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  # Python dependencies
  - package-ecosystem: "pip"
    directory: "/api"
    schedule:
      interval: "weekly"
    reviewers:
      - "team-backend"
    labels:
      - "dependencies"
      - "python"
  
  # JavaScript dependencies
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
    reviewers:
      - "team-frontend"
    labels:
      - "dependencies"
      - "javascript"
  
  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "github-actions"
  
  # Docker
  - package-ecosystem: "docker"
    directory: "/api"
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "docker"
  
  - package-ecosystem: "docker"
    directory: "/frontend"
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "docker"
```

### Step 8: Create Repository Settings Script
Create `.github/scripts/setup-repo.sh`:

```bash
#!/bin/bash

# Script to configure GitHub repository settings

REPO="your-org/budget-tool"

# Set up branch protection rules
gh api repos/$REPO/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["test-backend","test-frontend","test-integration"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null

# Create environments
gh api repos/$REPO/environments/staging \
  --method PUT \
  --field wait_timer=0 \
  --field reviewers='[]' \
  --field deployment_branch_policy='{"protected_branches":false,"custom_branch_policies":false}'

gh api repos/$REPO/environments/production \
  --method PUT \
  --field wait_timer=30 \
  --field reviewers='[{"type":"User","id":12345}]' \
  --field deployment_branch_policy='{"protected_branches":true,"custom_branch_policies":false}'

# Add secrets
echo "Add the following secrets to your repository:"
echo "  - GITHUB_TOKEN (auto-generated)"
echo "  - SONAR_TOKEN"
echo "  - CODE_CLIMATE_ID"
echo "  - SAFETY_API_KEY"

# Create labels
gh label create "ci/cd" --description "CI/CD pipeline related" --color "0052CC"
gh label create "automated" --description "Automated by GitHub Actions" --color "795548"
```

## Expected File Structure
After completing this task:

```
budget-tool/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── cd.yml
│   │   ├── security.yml
│   │   ├── release.yml
│   │   ├── code-quality.yml
│   │   └── scripts/
│   │       └── wait-for-services.sh
│   ├── dependabot.yml
│   └── scripts/
│       └── setup-repo.sh
```

## Success Criteria
- [ ] CI pipeline runs on every PR
- [ ] All tests pass in CI environment
- [ ] CD pipeline deploys on main branch merge
- [ ] Docker images build and push successfully
- [ ] Security scanning identifies vulnerabilities
- [ ] Code quality checks pass
- [ ] Release workflow creates GitHub releases
- [ ] Branch protection rules enforced
- [ ] Dependabot creates dependency update PRs
- [ ] All workflows complete within reasonable time

## Validation Commands
Run these commands to verify GitHub Actions setup:

```bash
# Check workflow syntax
yamllint .github/workflows/*.yml

# Test workflows locally with act
act -l  # List available workflows
act pull_request  # Test PR workflow
act push  # Test push workflow

# Manually trigger workflow
gh workflow run ci.yml

# View workflow runs
gh run list
gh run view

# Check workflow status
gh workflow view ci.yml

# View logs
gh run view --log

# Check secrets
gh secret list

# Verify branch protection
gh api repos/$GITHUB_REPOSITORY/branches/main/protection
```

## Troubleshooting
- If workflows don't trigger: Check event triggers and branch names
- If tests fail in CI but pass locally: Check environment differences
- If Docker build fails: Ensure build context is correct
- If permissions errors: Check GITHUB_TOKEN permissions
- If cache not working: Verify cache key patterns
- For slow workflows: Use matrix builds for parallelization

## Notes
- Use GitHub-hosted runners for simplicity
- Consider self-hosted runners for better performance or special requirements
- Secrets should never be hardcoded in workflows
- Use environments for deployment approvals
- Cache dependencies to speed up workflows
- Keep workflows DRY using composite actions for repeated steps

## Next Steps
After completing this task, proceed to:
- Task 24: Create comprehensive development documentation
- Task 25: Final validation and smoke tests