"use client";

import Link from "next/link";
import styles from "./page-navigation.module.css";

const pages = [
  { id: "quiz", href: "/", label: "SQL Quiz", week: "Week 7" },
  { id: "rag", href: "/rag", label: "AI Text-to-SQL", week: "Week 8" },
] as const;

type Props = {
  active: "quiz" | "rag";
  busy?: boolean;
};

export default function PageNavigation({ active, busy = false }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>MINE / SQL LAB</div>
      <nav className={styles.navigation} aria-label="SQL lab pages">
        {pages.map((page) => {
          const current = page.id === active;
          const label = <><span>{page.label}</span><small>{page.week}</small></>;

          if (current) {
            return (
              <span key={page.id} className={`${styles.tab} ${styles.active}`} aria-current="page">
                {label}
              </span>
            );
          }

          if (busy) {
            return (
              <span key={page.id} className={`${styles.tab} ${styles.disabled}`} role="link"
                aria-disabled="true" title="Wait for the current operation to finish.">
                {label}
              </span>
            );
          }

          return (
            <Link key={page.id} href={page.href} prefetch={false} className={styles.tab}>
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
