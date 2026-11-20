import { Rpc } from "@opencode/plugin/rpc";
const templateSchema = {
    type: "object",
    properties: {
        mcp: { type: "object", additionalProperties: { type: "boolean" } },
    },
    required: ["mcp"],
    additionalProperties: false,
};
const storeSchema = {
    type: "object",
    properties: {
        version: { type: "number" },
        defaultTemplate: { type: "string" },
        activeTemplates: { type: "object", additionalProperties: { type: "string" } },
        sessionOverrides: {
            type: "object",
            additionalProperties: { type: "object", additionalProperties: { type: "boolean" } },
        },
        templates: { type: "object", additionalProperties: templateSchema },
    },
    required: ["version", "defaultTemplate", "templates"],
    additionalProperties: false,
};
export const McpManagerRpc = Rpc.define({
    id: "opencode-mcp-manager",
    methods: {
        list: {
            input: { type: "object", additionalProperties: false },
            output: storeSchema,
        },
        apply: {
            input: {
                type: "object",
                properties: { name: { type: "string" }, sessionID: { type: "string" } },
                required: ["name"],
                additionalProperties: false,
            },
            output: { type: "object", properties: { store: storeSchema }, required: ["store"], additionalProperties: false },
            errors: {
                not_found: {
                    type: "object",
                    properties: { name: { type: "string" } },
                    required: ["name"],
                    additionalProperties: false,
                },
            },
        },
        save: {
            input: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    template: templateSchema,
                },
                required: ["name", "template"],
                additionalProperties: false,
            },
            output: { type: "object", properties: { store: storeSchema }, required: ["store"], additionalProperties: false },
        },
        setDefault: {
            input: {
                type: "object",
                properties: { name: { type: "string" } },
                required: ["name"],
                additionalProperties: false,
            },
            output: { type: "object", properties: { store: storeSchema }, required: ["store"], additionalProperties: false },
            errors: {
                not_found: {
                    type: "object",
                    properties: { name: { type: "string" } },
                    required: ["name"],
                    additionalProperties: false,
                },
            },
        },
        remove: {
            input: {
                type: "object",
                properties: { name: { type: "string" } },
                required: ["name"],
                additionalProperties: false,
            },
            output: { type: "object", properties: { store: storeSchema }, required: ["store"], additionalProperties: false },
            errors: {
                not_found: {
                    type: "object",
                    properties: { name: { type: "string" } },
                    required: ["name"],
                    additionalProperties: false,
                },
            },
        },
        clearActive: {
            input: { type: "object", additionalProperties: false },
            output: { type: "object", properties: { store: storeSchema }, required: ["store"], additionalProperties: false },
        },
        getSessionOverride: {
            input: {
                type: "object",
                properties: { sessionID: { type: "string" } },
                required: ["sessionID"],
                additionalProperties: false,
            },
            output: {
                type: "object",
                properties: { overrides: { type: "object", additionalProperties: { type: "boolean" } } },
                required: ["overrides"],
                additionalProperties: false,
            },
        },
        setSessionOverride: {
            input: {
                type: "object",
                properties: {
                    sessionID: { type: "string" },
                    overrides: { type: "object", additionalProperties: { type: "boolean" } },
                },
                required: ["sessionID", "overrides"],
                additionalProperties: false,
            },
            output: { type: "object", properties: { store: storeSchema }, required: ["store"], additionalProperties: false },
        },
        clearSessionOverride: {
            input: {
                type: "object",
                properties: { sessionID: { type: "string" } },
                required: ["sessionID"],
                additionalProperties: false,
            },
            output: { type: "object", properties: { store: storeSchema }, required: ["store"], additionalProperties: false },
        },
    },
    events: {
        templatesChanged: {
            schema: { type: "object", additionalProperties: false },
        },
    },
});
