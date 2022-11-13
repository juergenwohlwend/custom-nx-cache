import { NxJsonConfiguration } from "@nrwl/devkit";
import { TaskGraph, Task } from "@nrwl/devkit";
import { Hasher } from "@nrwl/devkit";
import { ProjectGraph } from "@nrwl/devkit";
import { TaskOrchestrator } from "nx/src/tasks-runner/task-orchestrator";
import { DaemonClient } from "nx/src/daemon/client/client";
import { NxArgs } from "nx/src/utils/command-line-utils";
import { TasksRunner, TaskStatus } from "@nrwl/workspace/src/tasks-runner/tasks-runner";
import { DefaultTasksRunnerOptions } from "@nrwl/workspace/src/tasks-runner/tasks-runner-v2";
import { LevelCache } from "./level-cache";


export const defaultTasksRunner: TasksRunner<DefaultTasksRunnerOptions> = async(
  tasks: Task[],
  options: DefaultTasksRunnerOptions & { levelTaskRunnerOptions: any },
  context: {
    target: string;
    initiatingProject?: string;
    projectGraph: ProjectGraph;
    nxJson: NxJsonConfiguration;
    nxArgs: NxArgs;
    taskGraph: TaskGraph;
    hasher: Hasher;
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
    hasher: Hasher;
    daemon: DaemonClient;
  }
): Promise<{ [id: string]: TaskStatus }> {

  performance.mark('task-graph-created');

  performance.measure('nx-prep-work', 'init-local', 'task-graph-created');
  performance.measure(
    'graph-creation',
    'command-execution-begins',
    'task-graph-created'
  );

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
