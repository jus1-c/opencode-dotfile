export const VilaoRpc = {
  id: "opencode.vilao-provider",
  methods: {},
  events: {
    error: {
      schema: {
        type: "object",
        properties: { code: { type: "string", enum: ["missing_pat", "missing_llm_key", "pat_rejected", "key_mismatch", "unavailable"] } },
        required: ["code"],
        additionalProperties: false,
      },
    },
  },
};
