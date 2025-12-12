# GitHub Actions Workflows

This directory contains automated workflows for the Budget Tool project.

## Workflows

### CI (ci.yml)
- **Trigger**: Push to main/develop, Pull requests
- **Purpose**: Run tests, linting, and build verification
- **Jobs**:
  - `backend-test`: Python tests with pytest
  - `frontend-test`: JavaScript tests and linting
  - `docker-build`: Verify Docker images build correctly

### Future Workflows

#### Release (release.yml) - TODO
- Automated release process
- Version tagging
- Docker image publishing
- Release notes generation

#### Deploy (deploy.yml) - TODO
- Deployment to staging/production
- Smoke tests
- Rollback capability

## Local Testing

To test workflows locally, you can use [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or see: https://github.com/nektos/act#installation

# Run workflows locally
act push  # Simulate push event
act pull_request  # Simulate PR event
```

## Secrets Required

The following secrets need to be configured in GitHub repository settings:

- `CODECOV_TOKEN` - For coverage reporting (optional)
- `DOCKER_HUB_USERNAME` - For Docker image publishing (future)
- `DOCKER_HUB_TOKEN` - For Docker image publishing (future)

## Workflow Maintenance

- Review and update dependency versions monthly
- Check for deprecated Actions quarterly
- Monitor workflow run times and optimize as needed