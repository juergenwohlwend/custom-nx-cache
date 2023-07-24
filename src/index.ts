import { NxJsonConfiguration } from "@nx/devkit";
import { TaskGraph, Task } from "@nx/devkit";
import { Hasher } from "@nx/devkit";
import { ProjectGraph } from "@nx/devkit";
import { TaskOrchestrator } from "nx/src/tasks-runner/task-orchestrator";
import { DaemonClient } from "nx/src/daemon/client/client";
import { NxArgs } from "nx/src/utils/command-line-utils";
import {
  TasksRunner,
  TaskStatus,
} from "@nx/workspace/src/tasks-runner/tasks-runner";
import { DefaultTasksRunnerOptions } from "@nx/devkit";
import { LevelCache } from "./level-cache";

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
    hasher: Hasher;
    daemon: DaemonClient;
  }
): Promise<{ [id: string]: TaskStatus }> => {
  options.remoteCache = new LevelCache(options.levelTaskRunnerOptions || {});

  if (
    (options as any)["parallel"] === "false" ||
    (options as any)["parallel"] === false
  ) {
    (options as any)["parallel"] = 1;
  } else if (
    (options as any)["parallel"] === "true" ||
    (options as any)["parallel"] === true ||
    (options as any)["parallel"] === undefined
  ) {
    (options as any)["parallel"] = Number((options as any)["maxParallel"] || 3);
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
  performance.mark("task-graph-created");

  performance.measure("nx-prep-work", "init-local", "task-graph-created");
  performance.measure(
    "graph-creation",
    "task-graph-created"
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
