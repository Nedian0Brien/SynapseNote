import { CopyPrompt } from '@/components/copy-prompt';

/**
 * Shared "Verify" body for the MCP-based integration docs. Single-sources the
 * verification prompt and the success expectation so the wording stays
 * consistent across pages. The prompt is capped at five docs
 * to keep the agent's verification response cheap. The expectation is generic —
 * SynapseNote's `exec` tool decides which command to run, so no specific
 * command is named. Per-editor restart/troubleshooting guidance stays in each
 * page after this block.
 */
export function VerifyExec({ subject = 'The agent' }: { subject?: string }) {
  return (
    <>
      <CopyPrompt>List the first 5 documents you come across in this project.</CopyPrompt>
      <p>
        {subject} should call the SynapseNote <code>exec</code> tool and respond with some of your
        documents.
      </p>
    </>
  );
}
