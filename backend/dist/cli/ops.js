import { spawn } from "node:child_process";
function arg(name) {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx === -1)
        return undefined;
    return process.argv[idx + 1];
}
function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}
function run(cmd, cmdArgs) {
    const p = spawn(cmd, cmdArgs, { stdio: "inherit", shell: true });
    p.on("exit", (code) => process.exit(code ?? 1));
}
const task = arg("task") ?? "server:dev";
// Everything after `--` is forwarded.
const dd = process.argv.indexOf("--");
const forward = dd === -1 ? [] : process.argv.slice(dd + 1);
if (hasFlag("help") || task === "help") {
    // eslint-disable-next-line no-console
    console.log([
        "Usage:",
        "  npm run ops -- --task <task> -- [task args]",
        "",
        "Tasks:",
        "  server:dev        Start backend dev server (tsx watch)",
        "  server:start      Start compiled server (node dist/index.js)",
        "  fetch:last        Fetch last N days of campaigns",
        "  backtest:last     Fetch+backtest last N days (writes summary CSV)",
        "  collect:live      Live-collect a campaign via CLOB WS",
        "  download:range    Download a conditionId over a time range",
        "",
        "Examples:",
        "  npm run ops -- --task server:dev",
        "  npm run ops -- --task fetch:last -- --days 3",
        "  npm run ops -- --task backtest:last -- --days 3 --feeRate 0.001",
    ].join("\n"));
    process.exit(0);
}
switch (task) {
    case "server:dev":
        run("npx", ["tsx", "watch", "src/index.ts", ...forward]);
        break;
    case "server:start":
        run("node", ["dist/index.js", ...forward]);
        break;
    case "fetch:last":
        run("npx", ["tsx", "src/cli/fetchLastDays.ts", ...forward]);
        break;
    case "backtest:last":
        run("npx", ["tsx", "src/cli/backtestLastDays.ts", ...forward]);
        break;
    case "collect:live":
        run("npx", ["tsx", "src/cli/collectLiveCampaign.ts", ...forward]);
        break;
    case "download:range":
        run("npx", ["tsx", "src/cli/downloadRange.ts", ...forward]);
        break;
    default:
        throw new Error(`Unknown --task '${task}'. Use --task help.`);
}
//# sourceMappingURL=ops.js.map