import { spawn } from "node:child_process";

const run = (name, color, command, args) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  return child;
};

const processes = [
  run("server", "cyan", "npm", ["run", "dev", "-w", "@video/server"]),
  run("web", "magenta", "npm", ["run", "dev", "-w", "@video/web"])
];

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of processes) {
      child.kill(signal);
    }
    process.exit(0);
  });
}
