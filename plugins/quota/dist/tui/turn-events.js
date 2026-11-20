function eventSessionID(event) {
    const sessionID = event.data?.sessionID;
    return typeof sessionID === "string" && sessionID ? sessionID : undefined;
}
function eventToolCallID(event) {
    const id = event.data?.id;
    return typeof id === "string" ? id : undefined;
}
/** Listens to the turn events until the returned stop. */
export function listenForTurns(on, listeners) {
    const questionToolCalls = new Set();
    const afterTurn = (event, trigger) => {
        const sessionID = eventSessionID(event);
        if (sessionID)
            listeners.afterTurn(trigger, sessionID, event);
    };
    const stops = [
        on("session.execution.succeeded", (event) => afterTurn(event, "reply")),
        on("session.compaction.ended", (event) => afterTurn(event, "compaction")),
        on("session.step.ended", (event) => {
            const sessionID = eventSessionID(event);
            if (sessionID)
                listeners.stepEnded(sessionID, event);
        }),
        on("session.tool.input.started", (event) => {
            const id = eventToolCallID(event);
            if (event.data?.name === "question" && id)
                questionToolCalls.add(id);
        }),
        on("session.tool.success", (event) => {
            const id = eventToolCallID(event);
            if (id && questionToolCalls.delete(id))
                afterTurn(event, "question");
        }),
        on("session.tool.failed", (event) => {
            const id = eventToolCallID(event);
            if (id)
                questionToolCalls.delete(id);
        }),
    ];
    return () => {
        for (const stop of stops)
            stop();
        questionToolCalls.clear();
    };
}
//# sourceMappingURL=turn-events.js.map