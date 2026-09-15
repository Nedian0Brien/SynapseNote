# Agent chat framework components

Selected source exports from `agent-chat-framework` revision
`62f5587613847d624a22a6735abd7d6dbc726324`.

| File | Source | License |
| --- | --- | --- |
| composer.tsx | src/registry/assistant-ui/elements/composer.tsx | MIT, AgentbaseAI Inc. |
| message.tsx | src/registry/ai-elements/message.tsx | Apache-2.0, Vercel, Inc. |
| conversation.tsx | src/registry/ai-elements/conversation.tsx | Apache-2.0, Vercel, Inc. |
| tool.tsx | src/registry/ai-elements/tool.tsx | Apache-2.0, Vercel, Inc. |

Upstream projects: https://github.com/assistant-ui/assistant-ui and
https://github.com/vercel/ai-elements. Full licenses are in `licenses/`.

Only consumed exports are retained. Changes are noted at each file's head.
SynapseNote owns the CLI state and persistence; these components consume props.
No dependency on the framework checkout or its Next.js demo backend is needed.
