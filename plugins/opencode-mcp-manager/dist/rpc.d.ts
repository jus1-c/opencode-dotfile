export declare const McpManagerRpc: {
    readonly id: "opencode-mcp-manager";
    readonly methods: {
        readonly list: {
            readonly input: {
                readonly type: "object";
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly version: {
                        readonly type: "number";
                    };
                    readonly defaultTemplate: {
                        readonly type: "string";
                    };
                    readonly activeTemplates: {
                        readonly type: "object";
                        readonly additionalProperties: {
                            readonly type: "string";
                        };
                    };
                    readonly sessionOverrides: {
                        readonly type: "object";
                        readonly additionalProperties: {
                            readonly type: "object";
                            readonly additionalProperties: {
                                readonly type: "boolean";
                            };
                        };
                    };
                    readonly templates: {
                        readonly type: "object";
                        readonly additionalProperties: {
                            readonly type: "object";
                            readonly properties: {
                                readonly mcp: {
                                    readonly type: "object";
                                    readonly additionalProperties: {
                                        readonly type: "boolean";
                                    };
                                };
                            };
                            readonly required: readonly ["mcp"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["version", "defaultTemplate", "templates"];
                readonly additionalProperties: false;
            };
        };
        readonly apply: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly name: {
                        readonly type: "string";
                    };
                    readonly sessionID: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["name"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly store: {
                        readonly type: "object";
                        readonly properties: {
                            readonly version: {
                                readonly type: "number";
                            };
                            readonly defaultTemplate: {
                                readonly type: "string";
                            };
                            readonly activeTemplates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "string";
                                };
                            };
                            readonly sessionOverrides: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly additionalProperties: {
                                        readonly type: "boolean";
                                    };
                                };
                            };
                            readonly templates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly mcp: {
                                            readonly type: "object";
                                            readonly additionalProperties: {
                                                readonly type: "boolean";
                                            };
                                        };
                                    };
                                    readonly required: readonly ["mcp"];
                                    readonly additionalProperties: false;
                                };
                            };
                        };
                        readonly required: readonly ["version", "defaultTemplate", "templates"];
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["store"];
                readonly additionalProperties: false;
            };
            readonly errors: {
                readonly not_found: {
                    readonly type: "object";
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                        };
                    };
                    readonly required: readonly ["name"];
                    readonly additionalProperties: false;
                };
            };
        };
        readonly save: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly name: {
                        readonly type: "string";
                    };
                    readonly template: {
                        readonly type: "object";
                        readonly properties: {
                            readonly mcp: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "boolean";
                                };
                            };
                        };
                        readonly required: readonly ["mcp"];
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["name", "template"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly store: {
                        readonly type: "object";
                        readonly properties: {
                            readonly version: {
                                readonly type: "number";
                            };
                            readonly defaultTemplate: {
                                readonly type: "string";
                            };
                            readonly activeTemplates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "string";
                                };
                            };
                            readonly sessionOverrides: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly additionalProperties: {
                                        readonly type: "boolean";
                                    };
                                };
                            };
                            readonly templates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly mcp: {
                                            readonly type: "object";
                                            readonly additionalProperties: {
                                                readonly type: "boolean";
                                            };
                                        };
                                    };
                                    readonly required: readonly ["mcp"];
                                    readonly additionalProperties: false;
                                };
                            };
                        };
                        readonly required: readonly ["version", "defaultTemplate", "templates"];
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["store"];
                readonly additionalProperties: false;
            };
        };
        readonly setDefault: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly name: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["name"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly store: {
                        readonly type: "object";
                        readonly properties: {
                            readonly version: {
                                readonly type: "number";
                            };
                            readonly defaultTemplate: {
                                readonly type: "string";
                            };
                            readonly activeTemplates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "string";
                                };
                            };
                            readonly sessionOverrides: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly additionalProperties: {
                                        readonly type: "boolean";
                                    };
                                };
                            };
                            readonly templates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly mcp: {
                                            readonly type: "object";
                                            readonly additionalProperties: {
                                                readonly type: "boolean";
                                            };
                                        };
                                    };
                                    readonly required: readonly ["mcp"];
                                    readonly additionalProperties: false;
                                };
                            };
                        };
                        readonly required: readonly ["version", "defaultTemplate", "templates"];
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["store"];
                readonly additionalProperties: false;
            };
            readonly errors: {
                readonly not_found: {
                    readonly type: "object";
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                        };
                    };
                    readonly required: readonly ["name"];
                    readonly additionalProperties: false;
                };
            };
        };
        readonly remove: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly name: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["name"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly store: {
                        readonly type: "object";
                        readonly properties: {
                            readonly version: {
                                readonly type: "number";
                            };
                            readonly defaultTemplate: {
                                readonly type: "string";
                            };
                            readonly activeTemplates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "string";
                                };
                            };
                            readonly sessionOverrides: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly additionalProperties: {
                                        readonly type: "boolean";
                                    };
                                };
                            };
                            readonly templates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly mcp: {
                                            readonly type: "object";
                                            readonly additionalProperties: {
                                                readonly type: "boolean";
                                            };
                                        };
                                    };
                                    readonly required: readonly ["mcp"];
                                    readonly additionalProperties: false;
                                };
                            };
                        };
                        readonly required: readonly ["version", "defaultTemplate", "templates"];
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["store"];
                readonly additionalProperties: false;
            };
            readonly errors: {
                readonly not_found: {
                    readonly type: "object";
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                        };
                    };
                    readonly required: readonly ["name"];
                    readonly additionalProperties: false;
                };
            };
        };
        readonly clearActive: {
            readonly input: {
                readonly type: "object";
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly store: {
                        readonly type: "object";
                        readonly properties: {
                            readonly version: {
                                readonly type: "number";
                            };
                            readonly defaultTemplate: {
                                readonly type: "string";
                            };
                            readonly activeTemplates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "string";
                                };
                            };
                            readonly sessionOverrides: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly additionalProperties: {
                                        readonly type: "boolean";
                                    };
                                };
                            };
                            readonly templates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly mcp: {
                                            readonly type: "object";
                                            readonly additionalProperties: {
                                                readonly type: "boolean";
                                            };
                                        };
                                    };
                                    readonly required: readonly ["mcp"];
                                    readonly additionalProperties: false;
                                };
                            };
                        };
                        readonly required: readonly ["version", "defaultTemplate", "templates"];
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["store"];
                readonly additionalProperties: false;
            };
        };
        readonly getSessionOverride: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly sessionID: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["sessionID"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly overrides: {
                        readonly type: "object";
                        readonly additionalProperties: {
                            readonly type: "boolean";
                        };
                    };
                };
                readonly required: readonly ["overrides"];
                readonly additionalProperties: false;
            };
        };
        readonly setSessionOverride: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly sessionID: {
                        readonly type: "string";
                    };
                    readonly overrides: {
                        readonly type: "object";
                        readonly additionalProperties: {
                            readonly type: "boolean";
                        };
                    };
                };
                readonly required: readonly ["sessionID", "overrides"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly store: {
                        readonly type: "object";
                        readonly properties: {
                            readonly version: {
                                readonly type: "number";
                            };
                            readonly defaultTemplate: {
                                readonly type: "string";
                            };
                            readonly activeTemplates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "string";
                                };
                            };
                            readonly sessionOverrides: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly additionalProperties: {
                                        readonly type: "boolean";
                                    };
                                };
                            };
                            readonly templates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly mcp: {
                                            readonly type: "object";
                                            readonly additionalProperties: {
                                                readonly type: "boolean";
                                            };
                                        };
                                    };
                                    readonly required: readonly ["mcp"];
                                    readonly additionalProperties: false;
                                };
                            };
                        };
                        readonly required: readonly ["version", "defaultTemplate", "templates"];
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["store"];
                readonly additionalProperties: false;
            };
        };
        readonly clearSessionOverride: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly sessionID: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["sessionID"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly store: {
                        readonly type: "object";
                        readonly properties: {
                            readonly version: {
                                readonly type: "number";
                            };
                            readonly defaultTemplate: {
                                readonly type: "string";
                            };
                            readonly activeTemplates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "string";
                                };
                            };
                            readonly sessionOverrides: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly additionalProperties: {
                                        readonly type: "boolean";
                                    };
                                };
                            };
                            readonly templates: {
                                readonly type: "object";
                                readonly additionalProperties: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly mcp: {
                                            readonly type: "object";
                                            readonly additionalProperties: {
                                                readonly type: "boolean";
                                            };
                                        };
                                    };
                                    readonly required: readonly ["mcp"];
                                    readonly additionalProperties: false;
                                };
                            };
                        };
                        readonly required: readonly ["version", "defaultTemplate", "templates"];
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["store"];
                readonly additionalProperties: false;
            };
        };
    };
    readonly events: {
        readonly templatesChanged: {
            readonly schema: {
                readonly type: "object";
                readonly additionalProperties: false;
            };
        };
    };
};
export type McpManagerRpc = typeof McpManagerRpc;
