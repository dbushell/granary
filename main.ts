/**
 * Detect JavaScript runtime
 */
if (Object.hasOwn(globalThis, "Deno")) {
  import("./src/adapters/deno.ts").then((module) => {
    console.log(`🦕 Git Granary for Deno`);
    module.main();
  });
} else if (Object.hasOwn(globalThis, "Bun")) {
  import("./src/adapters/bun.ts").then((module) => {
    console.log(`🍞 Git Granary for Bun`);
    module.main();
  });
} else {
  import("./src/adapters/node.ts").then((module) => {
    console.log(`📦 Git Granary for Node`);
    module.main();
  });
}
