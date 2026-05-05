import type { AURef, ProjectSummary } from "../../lib/types";

interface Props {
  readonly summary: ProjectSummary;
}

function fingerprintOf(au: AURef): string {
  return `${au.type_code}/${au.subtype}/${au.manufacturer}`;
}

export function PluginList({ summary }: Props) {
  const { fingerprints } = summary;
  return (
    <section aria-label="plug-ins">
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
