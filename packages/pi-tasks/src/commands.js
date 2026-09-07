import { formatTaskList } from "./render.js";
export function registerTaskCommands(pi, store) {
    pi.registerCommand("tasks", {
        description: "Show pi-tasks tasks on the current branch",
        handler: async (args, ctx) => {
            const mode = args.trim().toLowerCase();
            const includeDetails = mode === "detail" || mode === "details" || mode === "evidence";
            const summary = formatTaskList(store.getState(), {
                includeDone: includeDetails,
                includeEvidence: includeDetails,
                limit: includeDetails ? 20 : 10,
            });
            ctx.ui.notify(summary, "info");
        },
    });
}
