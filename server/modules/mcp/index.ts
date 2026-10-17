/** Domain module: Myelin remote MCP + agent skills/rules */
export { default as mcpPreferencesRoutes } from './preferences';
export { default as mcpHttpRoutes } from './mcpHttp';
export { default as organizationAgentDocsRoutes } from './organizationAgentDocs';
export { default as applicationAgentDocsRoutes } from './applicationAgentDocs';
export {
  normalizeRepositoryUrlKey,
  repositoryUrlsMatch,
  buildEffectiveProjectIds,
  mergeAgentDocs,
  canWriteViaMcp,
  coerceStrict,
  coerceAllowWrite,
  coerceProjectIds,
  matchApplicationsByRepositoryUrl,
  resolveMatchedApplications,
  assertNonEmptyScope,
} from './scopeHelpers';
