import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("all root layouts and global error boundaries use the shared local font", async () => {
  for (const site of ["marketplace", "personals", "admin"]) {
    for (const file of ["layout.jsx", "global-error.jsx"]) {
      const source = await readFile(
        new URL(`../../../../apps/${site}/app/${file}`, import.meta.url),
        "utf8",
      );
      assert.match(source, /import "@vezlist\/shared\/index\.css"/);
      assert.doesNotMatch(source, /next\/font\/google|inter\.variable/);
    }
  }
});

test("shared typography uses bundled variable Inter with swap and local assets", async () => {
  const stylesheet = await readFile(
    new URL("../index.css", import.meta.url),
    "utf8",
  );
  assert.match(stylesheet, /@import "@fontsource-variable\/inter\/index\.css"/);
  assert.match(stylesheet, /--font-sans:\s*"Inter Variable", ui-sans-serif/);

  const fontCss = await readFile(
    require.resolve("@fontsource-variable/inter/index.css"),
    "utf8",
  );
  assert.match(fontCss, /font-display: swap/);
  assert.match(fontCss, /font-weight: 100 900/);
  assert.doesNotMatch(fontCss, /https?:\/\//);
  const font = await readFile(
    require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
  );
  assert.equal(font.subarray(0, 4).toString(), "wOF2");
});
