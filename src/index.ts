import {
  DefaultTasksRunnerOptions,
  NxJsonConfiguration,
  ProjectGraph,
  Task,
  TaskGraph,
  TaskHasher,
} from '@nx/devkit';
import {
  TasksRunner,
  TaskStatus,
} from '@nx/workspace/src/tasks-runner/tasks-runner';
import { DaemonClient } from 'nx/src/daemon/client/client';
import { TaskOrchestrator } from 'nx/src/tasks-runner/task-orchestrator';
import { NxArgs } from 'nx/src/utils/command-line-utils';

import { LevelCache } from './level-cache';

export const defaultTasksRunner: TasksRunner<
  DefaultTasksRunnerOptions
> = async (
  tasks: Task[],
  options: DefaultTasksRunnerOptions & { levelTaskRunnerOptions: any },
  context: {
    target: string;
    initiatingProject?: string;
    projectGraph: ProjectGraph;
    nxJson: NxJsonConfiguration;
    nxArgs: NxArgs;
    taskGraph: TaskGraph;
    hasher: TaskHasher;
    daemon: DaemonClient;
  }
): Promise<{ [id: string]: TaskStatus }> => {
  options.remoteCache = new LevelCache(options.levelTaskRunnerOptions || {});

  if (
    (options as any)['parallel'] === 'false' ||
    (options as any)['parallel'] === false
  ) {
    (options as any)['parallel'] = 1;
  } else if (
    (options as any)['parallel'] === 'true' ||
    (options as any)['parallel'] === true ||
    (options as any)['parallel'] === undefined
  ) {
    (options as any)['parallel'] = Number((options as any)['maxParallel'] || 3);
  }

  options.lifeCycle.startCommand();
  try {
    return await runAllTasks(tasks, options, context);
  } finally {
    options.lifeCycle.endCommand();
  }
};

async function runAllTasks(
  tasks: Task[],
  options: DefaultTasksRunnerOptions,
  context: {
    initiatingProject?: string;
    projectGraph: ProjectGraph;
    nxJson: NxJsonConfiguration;
    nxArgs: NxArgs;
    taskGraph: TaskGraph;
    hasher: TaskHasher;
    daemon: DaemonClient;
  }
): Promise<{ [id: string]: TaskStatus }> {
  const orchestrator = new TaskOrchestrator(
    context.hasher,
    context.initiatingProject,
    context.projectGraph,
    context.taskGraph,
    options,
    context.nxArgs?.nxBail,
    context.daemon
  );

  return orchestrator.run();
}

export default defaultTasksRunner;
