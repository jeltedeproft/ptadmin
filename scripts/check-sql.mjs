// Ordering checks for the migrations.
//
// Postgres validates a lot at statement time, so a statement placed too early
// fails on a database that has data in it. Two of those have already bitten:
//
//   1. A `language sql` function body is parsed when the function is created,
//      so it cannot read a table defined further down the file.
//   2. A CHECK constraint is validated against existing rows the moment it is
//      added, so it cannot go on before the UPDATE that migrates those rows.
//
// Neither shows up in a syntax check, and neither shows up on an empty
// database — only on the one that already holds real data.
//
// Run: npm test (this is part of it) or node scripts/check-sql.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");

const problems = [];
let checked = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(dir, file), "utf8");
  checked++;

  const created = new Map();
  for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)) {
    if (!created.has(m[1])) created.set(m[1], m.index);
  }

  // 1a. A foreign key needs its target table to exist already.
  for (const m of sql.matchAll(/references\s+public\.(\w+)/gi)) {
    const at = created.get(m[1]);
    if (at !== undefined && at > m.index) {
      problems.push(`${file}: REFERENCES public.${m[1]} before its CREATE`);
    }
  }

  // 1b. A `language sql` body is validated at creation time.
  const fnRe =
    /create (?:or replace )?function\s+public\.(\w+)[\s\S]*?language\s+sql[\s\S]*?as \$\$([\s\S]*?)\$\$;/gi;
  for (const m of sql.matchAll(fnRe)) {
    for (const t of m[2].matchAll(/public\.(\w+)/g)) {
      const at = created.get(t[1]);
      if (at !== undefined && at > m.index) {
        problems.push(`${file}: function ${m[1]}() reads public.${t[1]}, created later`);
      }
    }
  }

  // 2. A CHECK constraint added before the data it checks is migrated.
  for (const m of sql.matchAll(/add constraint\s+(\w+)\s+check\s*\(([\s\S]*?)\)\s*;/gi)) {
    const columns = new Set([...m[2].matchAll(/\b(\w+)\s+(?:not\s+)?in\s*\(/gi)].map((c) => c[1]));
    for (const col of columns) {
      const upd = new RegExp(`update\\s+public\\.(\\w+)\\s+set\\s+${col}\\s*=`, "gi");
      for (const u of sql.matchAll(upd)) {
        if (u.index > m.index) {
          problems.push(
            `${file}: constraint ${m[1]} checks \`${col}\`, but an UPDATE migrating it comes later`,
          );
        }
      }
    }
  }

  // 3. A policy cannot call a function defined below it.
  const funcs = new Map();
  for (const m of sql.matchAll(/create (?:or replace )?function\s+public\.(\w+)/gi)) {
    if (!funcs.has(m[1])) funcs.set(m[1], m.index);
  }
  for (const m of sql.matchAll(/create policy[\s\S]*?;/gi)) {
    for (const c of m[0].matchAll(/(?:public\.)?(\w+)\s*\(/g)) {
      const at = funcs.get(c[1]);
      if (at !== undefined && at > m.index) {
        problems.push(`${file}: policy calls ${c[1]}() defined later`);
      }
    }
  }
}

const unique = [...new Set(problems)];
console.log(`\nsql-migraties (${checked} bestanden)`);
if (unique.length === 0) {
  console.log("  ok   geen volgordeproblemen");
  process.exit(0);
}
for (const p of unique) console.log(`  FAIL ${p}`);
process.exit(1);
