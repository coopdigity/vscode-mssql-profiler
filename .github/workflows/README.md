# GitHub Actions Workflows

This directory contains GitHub Actions workflows for automating build, test, and publish processes.

## Workflows

### 1. Build and Package (`build.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main`
- Release creation

**Jobs:**

#### Build Job
- Runs on: Ubuntu (Linux)
- Node version: 20.x
- Steps:
  1. Checkout code
  2. Setup Node.js with npm cache
  3. Install dependencies (`npm ci`)
  4. Lint code (continues on error)
  5. Compile TypeScript and bundle React
  6. Package extension as `.vsix`
  7. Upload `.vsix` as artifact (30 day retention)
  8. Upload to GitHub release (if triggered by release)

#### Test Job
- Runs on: Ubuntu, Windows, macOS (cross-platform testing)
- Node version: 20.x
- Steps:
  1. Checkout code
  2. Setup Node.js with npm cache
  3. Install dependencies
  4. Compile project
  5. Verify build outputs

**Artifacts:**
- `vscode-mssql-profiler-{sha}.vsix` - Available for 30 days after build

### 2. Publish to VS Code Marketplace (`publish.yml`)

**Triggers:**
- Release published
- Manual workflow dispatch (with version input)

**Job:**
- Runs on: Ubuntu (Linux)
- Node version: 20.x
- Steps:
  1. Checkout code
  2. Setup Node.js with npm cache
  3. Install dependencies
  4. Compile and build
  5. Install `vsce` (VS Code Extension Manager)
  6. Package extension
  7. Publish to VS Code Marketplace using `VSCE_PAT` secret
  8. Upload packaged extension (90 day retention)

**Required Secrets:**
- `VSCE_PAT` - Visual Studio Code Extension Personal Access Token

## Setup Instructions

### Prerequisites

1. **Fork/Clone this repository** to your GitHub account

2. **Create a Publisher Account** on Visual Studio Marketplace:
   - Go to https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft account
   - Create a publisher (if you don't have one)
   - Note your publisher ID

3. **Generate a Personal Access Token (PAT)**:
   - Go to https://dev.azure.com/{your-organization}/_usersSettings/tokens
   - Click "New Token"
   - Name: `vscode-marketplace`
   - Organization: `All accessible organizations`
   - Scopes: `Marketplace` → `Manage` (full access)
   - Copy the token immediately (you won't see it again!)

### Configure GitHub Secrets

1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add the following secret:
   - **Name:** `VSCE_PAT`
   - **Value:** Your Personal Access Token from step 3 above

### Update package.json

Before running workflows, update `package.json`:

```json
{
  "publisher": "your-actual-publisher-id",  // Change from "your-publisher-name"
  "repository": {
    "url": "https://github.com/your-username/vscode-mssql-profiler.git"  // Update URL
  }
}
```

## Usage

### Automatic Build on Push

Every push to `main` or `develop` triggers a build:
```bash
git add .
git commit -m "Your changes"
git push origin main
```

Check the Actions tab to see build progress.

### Manual Build

You can manually trigger a build from the Actions tab:
1. Go to Actions → Build and Package
2. Click "Run workflow"
3. Select branch and run

### Create a Release

To publish a new version:

1. **Update version in package.json:**
   ```bash
   npm version patch  # or minor, or major
   # This updates version to 0.2.1 (for example)
   ```

2. **Commit and tag:**
   ```bash
   git add package.json package-lock.json
   git commit -m "Bump version to 0.2.1"
   git tag v0.2.1
   git push origin main --tags
   ```

3. **Create GitHub Release:**
   - Go to Releases → Draft a new release
   - Choose tag: `v0.2.1`
   - Release title: `v0.2.1`
   - Describe changes (use CHANGELOG.md)
   - Click "Publish release"

4. **Automatic Publishing:**
   - `build.yml` runs and attaches `.vsix` to release
   - `publish.yml` runs and publishes to VS Code Marketplace

### Manual Publish

If you need to publish without creating a release:

1. Go to Actions → Publish to VS Code Marketplace
2. Click "Run workflow"
3. Enter version number (e.g., `0.2.0`)
4. Click "Run workflow"

## Troubleshooting

### Build Fails

**Problem:** `npm ci` fails
- **Solution:** Delete `package-lock.json`, run `npm install` locally, commit updated lock file

**Problem:** TypeScript compilation errors
- **Solution:** Run `npm run compile` locally to see errors, fix them, push changes

**Problem:** VSIX packaging fails
- **Solution:** Check that `out/` directory has compiled files, verify `package.json` is valid

### Publish Fails

**Problem:** `VSCE_PAT` secret not found
- **Solution:** Make sure you added the secret in repository settings (not organization settings)

**Problem:** "Publisher 'your-publisher-name' not found"
- **Solution:** Update `package.json` with your actual publisher ID from marketplace

**Problem:** "Extension validation failed"
- **Solution:** Run `vsce package` locally to see validation errors, fix them

**Problem:** "Version already published"
- **Solution:** You cannot re-publish the same version. Increment version number in `package.json`

### Artifacts Not Uploading

**Problem:** Artifact upload fails
- **Solution:** Check file path in workflow matches actual output (e.g., `*.vsix`)

**Problem:** Can't download artifact
- **Solution:** Artifacts expire after retention period (30 or 90 days). Check Actions tab → Workflow run → Artifacts section

## Advanced Configuration

### Add Code Coverage

Add to `build.yml` after tests:

```yaml
- name: Generate coverage report
  run: npm run coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/coverage-final.json
```

### Add Dependency Scanning

Add to `build.yml`:

```yaml
- name: Run npm audit
  run: npm audit --audit-level=moderate
  continue-on-error: true
```

### Add Pre-release Channel

Create `publish-prerelease.yml` for beta versions:

```yaml
name: Publish Pre-release

on:
  push:
    branches: [ develop ]

jobs:
  publish:
    # ... similar to publish.yml but use:
    run: vsce publish --pre-release -p $VSCE_PAT
```

### Matrix Testing with Multiple Node Versions

Update `build.yml` test job:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [18.x, 20.x, 22.x]  # Test multiple Node versions
```

## Best Practices

1. **Always test locally** before pushing:
   ```bash
   npm ci
   npm run compile
   npx vsce package
   ```

2. **Use semantic versioning:**
   - MAJOR version: Breaking changes
   - MINOR version: New features (backward compatible)
   - PATCH version: Bug fixes

3. **Update CHANGELOG.md** before each release

4. **Test on all platforms** - The test job runs on Windows, macOS, and Linux

5. **Keep secrets secure** - Never commit `VSCE_PAT` to repository

6. **Review artifacts** - Download and test `.vsix` files before publishing

## Workflow Status Badges

Add to README.md:

```markdown
![Build Status](https://github.com/yourusername/vscode-mssql-profiler/workflows/Build%20and%20Package/badge.svg)
![Publish Status](https://github.com/yourusername/vscode-mssql-profiler/workflows/Publish%20to%20VS%20Code%20Marketplace/badge.svg)
```

## Resources

- [VS Code Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce Documentation](https://github.com/microsoft/vscode-vsce)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Azure DevOps PAT](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)
