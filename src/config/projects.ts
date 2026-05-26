import { env } from './env.js';
import type { ProjectConfig } from '../types/index.js';

/**
 * Convert a project name into its environment-variable prefix.
 * "cupet" -> "CUPET", "my-app" -> "MY_APP".
 */
function envKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/**
 * Build the project registry from the PROJECTS list and the per-project
 * <NAME>_JWT_SECRET / <NAME>_TRIGGER_SECRET variables. Fails fast (exits)
 * if any required secret is missing, so misconfiguration never reaches runtime.
 */
function loadProjects(): Map<string, ProjectConfig> {
  const names = env.PROJECTS.split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  const registry = new Map<string, ProjectConfig>();
  const errors: string[] = [];

  for (const name of names) {
    const prefix = envKey(name);
    const jwtSecret = process.env[`${prefix}_JWT_SECRET`];
    const triggerSecret = process.env[`${prefix}_TRIGGER_SECRET`];

    if (!jwtSecret) errors.push(`Missing ${prefix}_JWT_SECRET for project "${name}"`);
    if (!triggerSecret) errors.push(`Missing ${prefix}_TRIGGER_SECRET for project "${name}"`);

    if (jwtSecret && triggerSecret) {
      registry.set(name, { name, jwtSecret, triggerSecret });
    }
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error('❌ Project configuration errors:\n  ' + errors.join('\n  '));
    process.exit(1);
  }

  return registry;
}

/** Map of project name -> config. */
export const projects = loadProjects();

/** Look up a project's config by name. */
export function getProject(name: string): ProjectConfig | undefined {
  return projects.get(name);
}

/** All configured project names. */
export const projectNames: string[] = [...projects.keys()];
