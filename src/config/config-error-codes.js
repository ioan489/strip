/**
 * Enum of possible configuration error codes.
 * Frozen to prevent accidental mutation.
 */
export const ConfigErrorCode = Object.freeze({
  INVALID_PORT: 'invalid_port',
  INVALID_NODE_ENV: 'invalid_node_env',
  INVALID_BASE: 'invalid_base',
  UNKNOWN_ENV_VAR: 'unknown_env_var',
  EMPTY_HOST: 'empty_host',
});
