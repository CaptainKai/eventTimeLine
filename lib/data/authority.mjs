const MODES = Object.freeze({
  parser: ['inline', 'shadow', 'worker'],
  dwd: ['postgres', 'iceberg-shadow', 'iceberg'],
  query: ['legacy', 'shadow', 'ads'],
});

export function resolveAuthority(domain, requestedMode, environment = process.env) {
  const allowed = MODES[domain];
  if (!allowed) throw new Error(`Unknown authority domain: ${domain}`);
  const fallback = allowed[0];
  const requested = requestedMode || fallback;
  if (!allowed.includes(requested)) throw new Error(`Unsupported ${domain} authority mode: ${requested}`);
  const runtimeValidated = environment.DATA_PLATFORM_RUNTIME_VALIDATED === 'true';
  const requiresRuntime = (domain === 'parser' && requested === 'worker') || (domain === 'dwd' && requested === 'iceberg');
  return {
    domain,
    requested_mode: requested,
    effective_mode: requiresRuntime && !runtimeValidated ? allowed[1] : requested,
    runtime_validated: runtimeValidated,
    guarded: requiresRuntime && !runtimeValidated,
  };
}

export function getAuthorityStatus(environment = process.env) {
  return {
    parser: resolveAuthority('parser', environment.PARSER_AUTHORITY_MODE, environment),
    dwd: resolveAuthority('dwd', environment.DWD_AUTHORITY_MODE, environment),
    query: resolveAuthority('query', environment.QUERY_AUTHORITY_MODE, environment),
  };
}
