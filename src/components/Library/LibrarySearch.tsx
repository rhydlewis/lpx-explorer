import { useLibraryStore } from "../../store/library-store";

import styles from "./LibrarySearch.module.css";

export function LibrarySearch() {
  const query = useLibraryStore((s) => s.query);
  const setQuery = useLibraryStore((s) => s.setQuery);

  return (
    <div className={styles.wrapper}>
      <input
        type="search"
        role="searchbox"
        aria-label="Search library"
        placeholder="Search library…"
        value={query}
        className={styles.input}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
          }
        }}
      />
    </div>
  );
}
