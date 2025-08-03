# AtlasCode VS Code Extension - AI Coding Agent Guide

## Project Overview

AtlasCode is a VS Code extension that integrates Jira and Bitbucket into the IDE. The architecture follows a dual-bundle pattern with TypeScript Node.js extension code and React webview components.

## Core Architecture

### Dual Build System

- **Extension Bundle**: Node.js code (`src/extension.ts` → `build/extension/`) via `webpack.extension.*.js`
- **React Bundle**: Webview UIs (`src/react/`, `src/webviews/`) via `webpack.react.*.js`
- Build with: `npm run compile` (both) or `npm run dev` (watch mode)
- Test with: `npm run test` (runs both unit and react test suites)

### Container-Based Dependency Injection

The `Container` class (`src/container.ts`) provides singleton access to all major services:

```typescript
Container.loginManager; // Auth management
Container.clientManager; // API clients
Container.siteManager; // Site configuration
Container.bitbucketContext; // BB state
```

### IPC Message System

Webview-extension communication uses structured message passing:

- **fromUI/**: Messages from webviews to extension (`src/lib/ipc/fromUI/`)
- **toUI/**: Messages from extension to webviews (`src/lib/ipc/toUI/`)
- **models/**: Shared data structures
- Pattern: `VSC*ActionApi` classes handle webview actions, `*MessageHandler` processes them

## Key Development Patterns

### Authentication Flow

- OAuth2 flow handled by `atlclients/authenticator.ts` with product-specific implementations
- Tokens stored via `CredentialManager` using VS Code's secure storage
- Multi-site support: users can connect multiple Jira/Bitbucket instances

### Webview Factory Pattern

Two webview types managed by factories:

- `SingleViewFactory`: One instance per type (settings, onboarding)
- `MultiViewFactory`: Multiple instances (PR details, issue views)

### Command Registration

Commands follow naming convention `atlascode.<product>.<action>`:

```typescript
Commands.ShowIssue = 'atlascode.jira.showIssue';
Commands.BitbucketOpenPullRequest = 'atlascode.bb.openPullRequest';
```

### Configuration Management

- Extension config namespace: `atlascode.*`
- Configuration class (`src/config/configuration.ts`) provides type-safe access
- Site-specific settings stored separately from VS Code settings

## Working with React Components

### Messaging API Hook

React components use `useMessagingApi()` hook for extension communication:

```tsx
const messagingApi = useMessagingApi();
await messagingApi.postMessage({...});
```

### Component Location Patterns

- `src/react/atlascode/`: Main UI components (issues, PRs, settings)
- `src/webviews/components/`: Legacy/alternative components
- `src/react/atlascode/rovo-dev/`: AI-powered development features

### Styling Approach

- Atlaskit components for consistency with Atlassian products
- CSS-in-JS via style objects, not styled-components
- Theme-aware colors: `var(--vscode-*)` CSS variables

## Testing Strategy

### Test Organization

- **Unit tests**: `jest.unit.config.ts` - Extension logic (`*.test.ts`)
- **React tests**: `jest.react.config.ts` - UI components (`*.test.tsx`)
- **E2E tests**: Playwright in `e2e/` directory with Docker setup

### Mocking Patterns

- VS Code API mocked in `__mocks__/vscode.ts`
- HTTP clients use `nock` for API mocking
- Component tests use `@testing-library/react`

## Development Workflow

### Local Development

```bash
npm install
npm run dev                    # Watch mode for both bundles
# F5 in VS Code to launch Extension Development Host
```

### Feature Flags

- Uses FX3 (Atlassian's feature flag system)
- API keys in `.env` file (Atlassian employees only)
- Graceful degradation when feature flags unavailable

### Debug Configuration

- Copy `.vscode/launch.json.example` to `.vscode/launch.json`
- Extension Host debugging via VS Code's built-in debugger
- Remote debugging supported via Dev Containers

## Critical Integration Points

### Git Integration

- Depends on `vscode.git` extension
- Branch/commit operations via VS Code's Git API
- PR creation integrates with local Git state

### Language Services

- YAML completion for Bitbucket Pipelines (`pipelines/yaml/`)
- Issue key detection in code comments (`jira/todoObserver.ts`)
- Hover providers for Jira issue keys

### External APIs

- Jira REST API v2/v3 via `atlclients/`
- Bitbucket Cloud/Server APIs with version detection
- GraphQL for specific Bitbucket operations

## Common Gotchas

### TypeScript Configuration

- Two tsconfigs: main (`tsconfig.json`) and test-only (`tsconfig.notest.json`)
- Path mapping: `src/*` resolves to project root
- Module resolution: `bundler` mode for modern webpack

### Webview Context

- Webviews run in separate contexts with different security policies
- Use `Container.webviewRouter` for message routing between webviews
- CSP restrictions apply to webview content

### Build Artifacts

- Never edit files in `build/` - they're generated
- Assets referenced via webpack manifest (`build/asset-manifest.json`)
- Extension entry point: `build/extension/extension.js`

## Rovo Dev (AI Features)

The newest feature set providing AI-powered development assistance:

- Process manager handles AI backend communication (`rovo-dev/rovoDevProcessManager.ts`)
- React UI in `src/react/atlascode/rovo-dev/` with chat interface
- Code actions and decorators provide AI suggestions in editor
