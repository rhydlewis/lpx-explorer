import type { AURef, ProjectSummary as ProjectSummaryData } from "../lib/types";

interface Props {
  readonly summary: ProjectSummaryData;
}

function fingerprintOf(au: AURef): string {
  return `${au.type_code}/${au.subtype}/${au.manufacturer}`;
}

export function ProjectSummary({ summary }: Props) {
  const { fingerprints } = summary;
  return (
    <section aria-label="project-summary">
      <p>
        {fingerprints.length} fingerprint{fingerprints.length === 1 ? "" : "s"}
      </p>
      <ul>
        {fingerprints.map((au) => (
          <li key={`${au.offset}:${fingerprintOf(au)}`}>{fingerprintOf(au)}</li>
        ))}
      </ul>
    </section>
  );
}
