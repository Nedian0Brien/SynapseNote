import type {
  DatabaseButtonPlan,
  DatabaseButtonPlanInput,
  DatabaseButtonPlanner,
} from './database-button.ts';
import type {
  DatabaseButtonExecutionInput,
  DatabaseButtonExecutor,
  DatabaseButtonRun,
} from './database-button-executor.ts';
import type { DatabaseCommitInput } from './database-commit.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';

type ButtonInvocation = Pick<
  DatabaseButtonPlan,
  'databaseId' | 'sourceId' | 'recordId' | 'propertyId' | 'buttonId'
>;

interface ButtonPort {
  assertReadable(): void;
  assertMutationAllowed(): void;
  authorizeOperation(input: {
    action: 'run_automation' | 'external_egress' | 'read_audit';
    databaseId?: string;
    sourceId?: string;
    recordIds?: readonly string[];
    propertyIds?: readonly string[];
  }): void;
  planner: DatabaseButtonPlanner | null;
  plans: Map<string, DatabaseButtonPlan>;
  invocationByPlanId: Map<string, ButtonInvocation>;
  executor(): DatabaseButtonExecutor | null;
  setExecutor(executor: DatabaseButtonExecutor): void;
  bindMutationActorToAccessPrincipal: boolean;
  trustedMutationActor(): DatabaseCommitInput['actor'];
}

export function createDatabaseButtonCoordinator(port: ButtonPort) {
  return {
    createButtonPlan(input: DatabaseButtonPlanInput): DatabaseButtonPlan {
      port.assertReadable();
      if (!port.planner) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Database Button planning is not configured for this server',
        );
      }
      const plan = port.planner.createPlan(input);
      port.plans.set(plan.id, structuredClone(plan));
      if (plan.internalPlan) {
        port.invocationByPlanId.set(plan.internalPlan.id, {
          databaseId: plan.databaseId,
          sourceId: plan.sourceId,
          recordId: plan.recordId,
          propertyId: plan.propertyId,
          buttonId: plan.buttonId,
        });
      }
      return plan;
    },

    configureButtonExecutor(executor: DatabaseButtonExecutor): void {
      port.setExecutor(executor);
    },

    async executeButton(
      input: DatabaseButtonExecutionInput,
    ): Promise<{ run: DatabaseButtonRun; undoToken: string | null }> {
      port.assertMutationAllowed();
      const executor = port.executor();
      if (!executor) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Database Button execution is unavailable on this server',
        );
      }
      const plan = port.plans.get(input.buttonPlanId);
      if (!plan) {
        throw new DatabaseDataPlaneError(
          'button_plan_expired',
          'Database Button plan expired; create and review a fresh plan',
          { buttonPlanId: input.buttonPlanId },
        );
      }
      port.authorizeOperation({
        action: 'run_automation',
        databaseId: plan.databaseId,
        sourceId: plan.sourceId,
        ...(plan.recordId ? { recordIds: [plan.recordId] } : {}),
        ...(plan.propertyId ? { propertyIds: [plan.propertyId] } : {}),
      });
      if (plan.externalSteps.length > 0) {
        port.authorizeOperation({
          action: 'external_egress',
          databaseId: plan.databaseId,
          sourceId: plan.sourceId,
        });
      }
      const result = await executor.execute(
        plan,
        port.bindMutationActorToAccessPrincipal
          ? { ...input, actor: port.trustedMutationActor() }
          : input,
      );
      if (result.run.state === 'succeeded' || result.run.state === 'failed') {
        port.plans.delete(input.buttonPlanId);
      }
      return result;
    },

    async listButtonRuns(limit = 100): Promise<DatabaseButtonRun[]> {
      port.authorizeOperation({ action: 'read_audit' });
      return port.executor()?.list(limit) ?? [];
    },
  };
}
