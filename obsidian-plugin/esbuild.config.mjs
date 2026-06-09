import esbuild from "esbuild";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  platform: "browser",
});

if (production) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
