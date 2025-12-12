# Branch Protection Rules

## Recommended Settings for `main` branch:

### Basic Settings
- [x] Require a pull request before merging
  - [x] Require approvals: 1
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from CODEOWNERS

### Status Checks
- [x] Require status checks to pass before merging
  - [x] Require branches to be up to date before merging
  - Required status checks:
    - `backend-test`
    - `frontend-test`
    - `docker-build`

### Additional Rules
- [x] Require conversation resolution before merging
- [x] Require signed commits (optional)
- [x] Include administrators
- [x] Restrict who can push to matching branches (optional)

## Setting Up Branch Protection

1. Go to Settings → Branches in your GitHub repository
2. Add a new branch protection rule for `main`
3. Configure settings as above
4. Save changes

## Development Workflow

1. Create feature branch from `main`
2. Make changes and commit
3. Push feature branch
4. Create pull request to `main`
5. Wait for CI checks to pass
6. Get code review approval
7. Merge to main