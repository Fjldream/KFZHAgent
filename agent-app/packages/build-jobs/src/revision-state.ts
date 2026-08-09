const SOLUTION_REVISION_STATE_SCHEMA = "kf-solution-revision-state/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function solutionProjects(state: unknown): unknown[] | undefined {
  if (!isRecord(state) || state["schema"] !== SOLUTION_REVISION_STATE_SCHEMA) {
    return undefined;
  }
  const projects = state["projects"];
  return Array.isArray(projects) ? projects : undefined;
}

function isTargetProject(
  project: Record<string, unknown>,
  projectKey: string,
  domainKind: string,
): boolean {
  const projectDomain = project["domainKind"] ?? project["domain"];
  return project["projectKey"] === projectKey && projectDomain === domainKind;
}

/** Selects only the target project's IR, while accepting legacy single-project revision state. */
export function resolveRevisionProjectIr(
  state: unknown,
  projectKey: string,
  domainKind: string,
): unknown {
  const projects = solutionProjects(state);
  if (projects === undefined) return state ?? {};

  const matches = projects.filter(
    (project) => isRecord(project) && isTargetProject(project, projectKey, domainKind),
  );
  if (matches.length !== 1) {
    throw new Error(
      `revision state must contain exactly one project ${projectKey} (${domainKind}); found ${matches.length}`,
    );
  }
  const project = matches[0];
  if (!isRecord(project) || !("projectIr" in project)) {
    throw new Error(`revision project ${projectKey} (${domainKind}) has no projectIr`);
  }
  return project["projectIr"];
}

/** Preserves the solution envelope and changes build metadata for the target project only. */
export function replaceRevisionProjectBuildState(
  state: unknown,
  projectKey: string,
  domainKind: string,
  buildState: unknown,
): unknown {
  const projects = solutionProjects(state);
  if (projects === undefined || !isRecord(state)) return buildState;

  let replaced = false;
  const nextProjects = projects.map((project) => {
    if (!isRecord(project) || !isTargetProject(project, projectKey, domainKind)) return project;
    replaced = true;
    return { ...project, buildState };
  });
  if (!replaced) {
    nextProjects.push({ projectKey, domainKind, buildState });
  }
  return { ...state, projects: nextProjects };
}
