import {
  solutionRevisionStateSchema,
  type SolutionRevisionProject,
  type SolutionRevisionState,
} from "@kf/contracts";

const SOLUTION_REVISION_STATE_SCHEMA = "kf-solution-revision-state/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSolutionRevisionState(state: unknown): SolutionRevisionState | undefined {
  if (!isRecord(state) || state["schema"] !== SOLUTION_REVISION_STATE_SCHEMA) {
    return undefined;
  }
  const parsed = solutionRevisionStateSchema.safeParse(state);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "state"}: ${issue.message}`)
      .join("; ");
    throw new RevisionStateError(`invalid solution revision state: ${details}`);
  }
  return parsed.data;
}

function projectDomain(project: SolutionRevisionProject): string {
  const domain = project.domainKind ?? project.domain;
  if (domain === undefined) {
    throw new RevisionStateError("invalid solution revision state: project domain is missing");
  }
  return domain;
}

function selectProject(
  state: SolutionRevisionState,
  projectKey: string,
  domainKind: string,
): SolutionRevisionProject {
  const project = state.projects.find((candidate) => candidate.projectKey === projectKey);
  if (project === undefined) {
    throw new RevisionStateError(`revision state has no projectKey ${projectKey}`);
  }
  const boundDomain = projectDomain(project);
  if (boundDomain !== domainKind) {
    throw new RevisionStateError(
      `projectKey ${projectKey} belongs to domain ${boundDomain}, not ${domainKind}`,
    );
  }
  return project;
}

/** Validates a tagged envelope and its key/domain binding; legacy state remains accepted. */
export function validateRevisionProjectBinding(
  state: unknown,
  projectKey: string,
  domainKind: string,
): void {
  const parsed = parseSolutionRevisionState(state);
  if (parsed !== undefined) selectProject(parsed, projectKey, domainKind);
}

/** Selects only the target project's IR, while accepting legacy single-project revision state. */
export function resolveRevisionProjectIr(
  state: unknown,
  projectKey: string,
  domainKind: string,
): unknown {
  const parsed = parseSolutionRevisionState(state);
  if (parsed === undefined) return state ?? {};

  const project = selectProject(parsed, projectKey, domainKind);
  if (!("projectIr" in project)) {
    throw new RevisionStateError(
      `revision project ${projectKey} (${domainKind}) has no projectIr`,
    );
  }
  return project.projectIr;
}

/** Preserves the solution envelope and changes build metadata for the target project only. */
export function replaceRevisionProjectBuildState(
  state: unknown,
  projectKey: string,
  domainKind: string,
  buildState: unknown,
): unknown {
  const parsed = parseSolutionRevisionState(state);
  if (parsed === undefined) return buildState;

  selectProject(parsed, projectKey, domainKind);
  const nextProjects = parsed.projects.map((project) => {
    if (project.projectKey !== projectKey) return project;
    return { ...project, buildState };
  });
  return { ...parsed, projects: nextProjects };
}

export class RevisionStateError extends Error {
  override name = "RevisionStateError";
}
